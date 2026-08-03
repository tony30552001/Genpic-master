const { query } = require("./db");

const SUPPORTED_IMAGE_MODELS = Object.freeze([
  "gemini-imagen",
  "gpt-image-2",
]);

const DEFAULT_MODEL = "gemini-imagen";
const DEFAULT_ALLOWED_MODELS = Object.freeze([DEFAULT_MODEL]);

const normalizeModels = (models) => {
  if (!Array.isArray(models)) return [];
  return Array.from(
    new Set(models.map((model) => String(model).trim()).filter(Boolean))
  );
};

const mapPolicy = (row) => ({
  allowedModels: normalizeModels(row.allowed_models),
  defaultModel: row.default_model,
  updatedAt: row.updated_at
    ? { seconds: Math.floor(new Date(row.updated_at).getTime() / 1000) }
    : null,
});

const ensureModelPolicy = async (tenantId) => {
  await query(
    `INSERT INTO tenant_model_settings (tenant_id)
     VALUES ($1)
     ON CONFLICT (tenant_id) DO NOTHING`,
    [tenantId]
  );

  const result = await query(
    `SELECT allowed_models, default_model, updated_at
     FROM tenant_model_settings
     WHERE tenant_id = $1
     LIMIT 1`,
    [tenantId]
  );

  if (result.rows.length === 0) {
    throw new Error("Tenant model settings are not available");
  }

  return mapPolicy(result.rows[0]);
};

const validateModelPolicy = ({ allowedModels, defaultModel }) => {
  const normalizedAllowedModels = normalizeModels(allowedModels);
  const normalizedDefaultModel = String(defaultModel || "").trim();

  if (normalizedAllowedModels.length === 0) {
    throw new Error("至少需要開放一個圖片生成模型");
  }

  const unsupported = normalizedAllowedModels.filter(
    (model) => !SUPPORTED_IMAGE_MODELS.includes(model)
  );
  if (unsupported.length > 0) {
    throw new Error(`不支援的圖片生成模型：${unsupported.join(", ")}`);
  }

  if (!SUPPORTED_IMAGE_MODELS.includes(normalizedDefaultModel)) {
    throw new Error("預設圖片生成模型不支援");
  }

  if (!normalizedAllowedModels.includes(normalizedDefaultModel)) {
    throw new Error("預設模型必須包含在開放模型清單中");
  }

  return {
    allowedModels: normalizedAllowedModels,
    defaultModel: normalizedDefaultModel,
  };
};

const updateModelPolicy = async ({
  tenantId,
  allowedModels,
  defaultModel,
  updatedBy,
}) => {
  const normalized = validateModelPolicy({ allowedModels, defaultModel });
  const result = await query(
    `UPDATE tenant_model_settings
     SET allowed_models = $1,
         default_model = $2,
         updated_by = $3,
         updated_at = now()
     WHERE tenant_id = $4
     RETURNING allowed_models, default_model, updated_at`,
    [
      normalized.allowedModels,
      normalized.defaultModel,
      updatedBy || null,
      tenantId,
    ]
  );

  if (result.rows.length === 0) {
    throw new Error("Tenant model settings are not available");
  }

  return mapPolicy(result.rows[0]);
};

module.exports = {
  DEFAULT_ALLOWED_MODELS,
  DEFAULT_MODEL,
  SUPPORTED_IMAGE_MODELS,
  ensureModelPolicy,
  mapPolicy,
  normalizeModels,
  updateModelPolicy,
  validateModelPolicy,
};
