/**
 * Tenant-managed analysis models (LLM).
 *
 * Model names, endpoints and API keys are maintained in the admin center and
 * stored in `llm_models`; `llm_role_assignments` binds one model (and an
 * optional peer model used when the primary one fails) to each analysis role.
 * API keys are encrypted with api/_shared/secretCrypto.js and never leave the
 * backend.
 */

const { query } = require("./db");
const { encrypt, decrypt } = require("./secretCrypto");
const { isPublicHttpsEndpoint } = require("./urlValidator");
const { postJsonCompletion } = require("./azureOpenAI");
const { getModel } = require("./gemini");

const PROVIDERS = Object.freeze({
  AZURE_OPENAI: "azure-openai",
  GOOGLE_GEMINI: "google-gemini",
});

const LLM_PROVIDERS = Object.freeze([
  {
    id: PROVIDERS.AZURE_OPENAI,
    label: "Azure OpenAI",
    requiresEndpoint: true,
    endpointHint: "https://<resource>.openai.azure.com",
  },
  {
    id: PROVIDERS.GOOGLE_GEMINI,
    label: "Google Gemini",
    requiresEndpoint: false,
    endpointHint: "",
  },
]);

/**
 * Each role stays on the provider its call path is built for: document analysis
 * and deck authoring rely on the Azure Responses API payload shape, and the
 * Gemini roles rely on the Gemini SDK.
 */
const LLM_ROLES = Object.freeze([
  {
    id: "document_analysis",
    label: "文件分析",
    provider: PROVIDERS.AZURE_OPENAI,
    description: "上傳文件後拆解場景與重點",
  },
  {
    id: "prompt_optimization",
    label: "Prompt 優化",
    provider: PROVIDERS.AZURE_OPENAI,
    description: "把使用者輸入改寫為中英文生成 Prompt",
  },
  {
    id: "deck_authoring",
    label: "簡報生成",
    provider: PROVIDERS.AZURE_OPENAI,
    description: "PPT Master 的大綱與每頁 SVG 版面",
  },
  {
    id: "style_analysis",
    label: "風格分析",
    provider: PROVIDERS.GOOGLE_GEMINI,
    description: "從參考圖萃取風格描述與標籤",
  },
  {
    id: "filename",
    label: "檔名生成",
    provider: PROVIDERS.GOOGLE_GEMINI,
    description: "依生成內容命名輸出檔案",
  },
  {
    id: "scene_optimization",
    label: "場景優化",
    provider: PROVIDERS.GOOGLE_GEMINI,
    description: "改寫單一場景的描述與視覺 Prompt",
  },
]);

class LlmValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "LlmValidationError";
    this.code = "bad_request";
    this.status = 400;
  }
}

class LlmConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = "LlmConflictError";
    this.code = "conflict";
    this.status = 409;
  }
}

class LlmConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "LlmConfigurationError";
    this.code = "llm_not_configured";
    this.status = 503;
  }
}

const getRole = (roleId) =>
  LLM_ROLES.find((role) => role.id === String(roleId || "").trim()) || null;

const timestamp = (value) =>
  value ? { seconds: Math.floor(new Date(value).getTime() / 1000) } : null;

const mapModel = (row) => ({
  id: row.id,
  label: row.label,
  provider: row.provider,
  modelName: row.model_name,
  endpoint: row.endpoint || "",
  hasApiKey: Boolean(row.api_key_encrypted),
  createdAt: timestamp(row.created_at),
  updatedAt: timestamp(row.updated_at),
});

const mapAssignment = (row) => ({
  role: row.role,
  modelId: row.model_id,
  fallbackModelId: row.fallback_model_id || null,
  updatedAt: timestamp(row.updated_at),
});

const normalizeText = (value) => String(value ?? "").trim();

const validateModelInput = ({ label, provider, modelName, endpoint }) => {
  const normalized = {
    label: normalizeText(label),
    provider: normalizeText(provider),
    modelName: normalizeText(modelName),
    endpoint: normalizeText(endpoint),
  };

  if (!normalized.label) {
    throw new LlmValidationError("請填寫模型名稱標籤");
  }
  if (!LLM_PROVIDERS.some((item) => item.id === normalized.provider)) {
    throw new LlmValidationError("不支援的模型供應商");
  }
  if (!normalized.modelName) {
    throw new LlmValidationError("請填寫部署或模型代號");
  }

  if (normalized.provider === PROVIDERS.AZURE_OPENAI) {
    if (!normalized.endpoint) {
      throw new LlmValidationError("Azure OpenAI 模型必須填寫端點");
    }
    if (!isPublicHttpsEndpoint(normalized.endpoint)) {
      throw new LlmValidationError("端點必須是公開可連線的 https 網址");
    }
  } else {
    normalized.endpoint = "";
  }

  return normalized;
};

const listLlmModels = async (tenantId) => {
  const result = await query(
    `SELECT id, label, provider, model_name, endpoint, api_key_encrypted,
            created_at, updated_at
     FROM llm_models
     WHERE tenant_id = $1
     ORDER BY provider ASC, lower(label) ASC`,
    [tenantId]
  );
  return result.rows.map(mapModel);
};

const isUniqueViolation = (error) => error?.code === "23505";

const createLlmModel = async ({
  tenantId,
  label,
  provider,
  modelName,
  endpoint,
  apiKey,
  createdBy,
}) => {
  const normalized = validateModelInput({ label, provider, modelName, endpoint });
  const key = normalizeText(apiKey);
  if (!key) {
    throw new LlmValidationError("請填寫 API 金鑰");
  }

  try {
    const result = await query(
      `INSERT INTO llm_models
         (tenant_id, label, provider, model_name, endpoint, api_key_encrypted, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, label, provider, model_name, endpoint, api_key_encrypted,
                 created_at, updated_at`,
      [
        tenantId,
        normalized.label,
        normalized.provider,
        normalized.modelName,
        normalized.endpoint || null,
        encrypt(key),
        createdBy || null,
      ]
    );
    return mapModel(result.rows[0]);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new LlmConflictError("已有同名的分析模型");
    }
    throw error;
  }
};

const updateLlmModel = async ({
  tenantId,
  id,
  label,
  provider,
  modelName,
  endpoint,
  apiKey,
}) => {
  if (!id) {
    throw new LlmValidationError("缺少模型 id");
  }
  const normalized = validateModelInput({ label, provider, modelName, endpoint });
  const key = normalizeText(apiKey);

  try {
    const result = await query(
      `UPDATE llm_models
       SET label = $1,
           provider = $2,
           model_name = $3,
           endpoint = $4,
           api_key_encrypted = COALESCE($5, api_key_encrypted),
           updated_at = now()
       WHERE id = $6 AND tenant_id = $7
       RETURNING id, label, provider, model_name, endpoint, api_key_encrypted,
                 created_at, updated_at`,
      [
        normalized.label,
        normalized.provider,
        normalized.modelName,
        normalized.endpoint || null,
        key ? encrypt(key) : null,
        id,
        tenantId,
      ]
    );
    if (result.rows.length === 0) {
      throw new LlmValidationError("找不到分析模型");
    }
    return mapModel(result.rows[0]);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new LlmConflictError("已有同名的分析模型");
    }
    throw error;
  }
};

const deleteLlmModel = async ({ tenantId, id }) => {
  if (!id) {
    throw new LlmValidationError("缺少模型 id");
  }

  const assigned = await query(
    `SELECT role
     FROM llm_role_assignments
     WHERE tenant_id = $1 AND (model_id = $2 OR fallback_model_id = $2)`,
    [tenantId, id]
  );
  if (assigned.rows.length > 0) {
    const roleLabels = assigned.rows
      .map((row) => getRole(row.role)?.label || row.role)
      .join("、");
    throw new LlmConflictError(`模型仍被「${roleLabels}」使用，請先改指派其他模型`);
  }

  const result = await query(
    "DELETE FROM llm_models WHERE id = $1 AND tenant_id = $2 RETURNING id",
    [id, tenantId]
  );
  if (result.rows.length === 0) {
    throw new LlmValidationError("找不到分析模型");
  }
};

const listRoleAssignments = async (tenantId) => {
  const result = await query(
    `SELECT role, model_id, fallback_model_id, updated_at
     FROM llm_role_assignments
     WHERE tenant_id = $1`,
    [tenantId]
  );
  return result.rows.map(mapAssignment);
};

const setRoleAssignment = async ({
  tenantId,
  role,
  modelId,
  fallbackModelId,
  updatedBy,
}) => {
  const roleInfo = getRole(role);
  if (!roleInfo) {
    throw new LlmValidationError("不支援的分析用途");
  }

  const primaryId = normalizeText(modelId);
  const fallbackId = normalizeText(fallbackModelId);
  if (!primaryId) {
    throw new LlmValidationError("請選擇主要模型");
  }
  if (fallbackId && fallbackId === primaryId) {
    throw new LlmValidationError("備援模型必須與主要模型不同");
  }

  const ids = fallbackId ? [primaryId, fallbackId] : [primaryId];
  const models = await query(
    "SELECT id, provider FROM llm_models WHERE tenant_id = $1 AND id = ANY($2::uuid[])",
    [tenantId, ids]
  );
  if (models.rows.length !== ids.length) {
    throw new LlmValidationError("找不到指定的分析模型");
  }
  const mismatched = models.rows.find((row) => row.provider !== roleInfo.provider);
  if (mismatched) {
    const providerLabel = LLM_PROVIDERS.find(
      (item) => item.id === roleInfo.provider
    )?.label;
    throw new LlmValidationError(
      `「${roleInfo.label}」只能使用 ${providerLabel} 的模型`
    );
  }

  const result = await query(
    `INSERT INTO llm_role_assignments
       (tenant_id, role, model_id, fallback_model_id, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (tenant_id, role) DO UPDATE
       SET model_id = EXCLUDED.model_id,
           fallback_model_id = EXCLUDED.fallback_model_id,
           updated_by = EXCLUDED.updated_by,
           updated_at = now()
     RETURNING role, model_id, fallback_model_id, updated_at`,
    [tenantId, roleInfo.id, primaryId, fallbackId || null, updatedBy || null]
  );
  return mapAssignment(result.rows[0]);
};

const toRuntimeModel = (row) => ({
  id: row.id,
  label: row.label,
  modelName: row.model_name,
  endpoint: row.endpoint || "",
  apiKey: decrypt(row.api_key_encrypted),
});

/**
 * Resolves the model a role must use. Throws LlmConfigurationError when the
 * admin center has no assignment yet, so the caller can surface a 503 instead
 * of silently falling back to another model.
 */
const resolveRoleModel = async (tenantId, role) => {
  const roleInfo = getRole(role);
  if (!roleInfo) {
    throw new LlmValidationError("不支援的分析用途");
  }

  const result = await query(
    `SELECT primary_model.id,
            primary_model.label,
            primary_model.model_name,
            primary_model.endpoint,
            primary_model.api_key_encrypted,
            fallback_model.id AS fallback_id,
            fallback_model.label AS fallback_label,
            fallback_model.model_name AS fallback_model_name,
            fallback_model.endpoint AS fallback_endpoint,
            fallback_model.api_key_encrypted AS fallback_api_key_encrypted
     FROM llm_role_assignments assignment
     JOIN llm_models primary_model ON primary_model.id = assignment.model_id
     LEFT JOIN llm_models fallback_model
       ON fallback_model.id = assignment.fallback_model_id
     WHERE assignment.tenant_id = $1 AND assignment.role = $2
     LIMIT 1`,
    [tenantId, roleInfo.id]
  );

  const row = result.rows[0];
  if (!row) {
    throw new LlmConfigurationError(
      `尚未在管理中心設定「${roleInfo.label}」使用的分析模型`
    );
  }

  return {
    role: roleInfo.id,
    provider: roleInfo.provider,
    model: toRuntimeModel(row),
    fallback: row.fallback_id
      ? toRuntimeModel({
          id: row.fallback_id,
          label: row.fallback_label,
          model_name: row.fallback_model_name,
          endpoint: row.fallback_endpoint,
          api_key_encrypted: row.fallback_api_key_encrypted,
        })
      : null,
  };
};

/**
 * Calls the model once so an administrator can verify a draft or saved
 * configuration before assigning it to a role.
 */
const testLlmModel = async ({ provider, modelName, endpoint, apiKey }) => {
  const normalized = validateModelInput({
    label: "test",
    provider,
    modelName,
    endpoint,
  });
  const key = normalizeText(apiKey);
  if (!key) {
    throw new LlmValidationError("請填寫 API 金鑰");
  }

  const startedAt = Date.now();
  if (normalized.provider === PROVIDERS.AZURE_OPENAI) {
    await postJsonCompletion({
      model: {
        modelName: normalized.modelName,
        endpoint: normalized.endpoint,
        apiKey: key,
      },
      systemMessage: 'Reply with the JSON object {"ok":true}.',
      userMessage: "ping",
      maxOutputTokens: 2048,
    });
  } else {
    const result = await getModel(normalized.modelName, key).generateContent(
      [{ role: "user", parts: [{ text: 'Reply with the JSON object {"ok":true}.' }] }],
      { responseMimeType: "application/json" }
    );
    if (!result) {
      throw new Error("Gemini 沒有回傳內容");
    }
  }

  return { latencyMs: Date.now() - startedAt };
};

/** Resolves a saved model so it can be tested without exposing its key. */
const getLlmModelSecret = async ({ tenantId, id }) => {
  const result = await query(
    `SELECT id, label, provider, model_name, endpoint, api_key_encrypted
     FROM llm_models
     WHERE id = $1 AND tenant_id = $2
     LIMIT 1`,
    [id, tenantId]
  );
  const row = result.rows[0];
  if (!row) {
    throw new LlmValidationError("找不到分析模型");
  }
  return {
    provider: row.provider,
    modelName: row.model_name,
    endpoint: row.endpoint || "",
    apiKey: decrypt(row.api_key_encrypted),
  };
};

module.exports = {
  LLM_PROVIDERS,
  LLM_ROLES,
  LlmConfigurationError,
  LlmConflictError,
  LlmValidationError,
  createLlmModel,
  deleteLlmModel,
  getLlmModelSecret,
  getRole,
  listLlmModels,
  listRoleAssignments,
  resolveRoleModel,
  setRoleAssignment,
  testLlmModel,
  updateLlmModel,
  validateModelInput,
};
