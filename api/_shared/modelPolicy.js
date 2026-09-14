const { query } = require("./db");
const { ImageModelError } = require("./imageModelConfig");
const { listPublicImageModels, withImageModelTransaction } = require("./imageModels");

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

const ensureModelPolicy = async (tenantId, client) => {
  const runQuery = client ? client.query.bind(client) : query;
  await runQuery(
    `INSERT INTO tenant_model_settings (tenant_id)
     VALUES ($1)
     ON CONFLICT (tenant_id) DO NOTHING`,
    [tenantId]
  );

  const result = await runQuery(
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

const validateModelPolicy = ({ allowedModels, defaultModel, models }) => {
  if (
    !Array.isArray(allowedModels) ||
    allowedModels.some((model) => typeof model !== "string") ||
    typeof defaultModel !== "string"
  ) {
    throw new ImageModelError("請提供有效的開放模型清單與預設模型");
  }
  const normalizedAllowedModels = normalizeModels(allowedModels);
  const normalizedDefaultModel = defaultModel.trim();
  const available = new Set(models.map((model) => model.modelKey));

  if (normalizedAllowedModels.length === 0) {
    throw new ImageModelError("至少需要開放一個圖片生成模型");
  }

  const unsupported = normalizedAllowedModels.filter(
    (model) => !available.has(model)
  );
  if (unsupported.length > 0) {
    throw new ImageModelError("開放清單包含未登錄的圖片模型");
  }

  if (!available.has(normalizedDefaultModel)) {
    throw new ImageModelError("預設圖片模型尚未登錄");
  }

  if (!normalizedAllowedModels.includes(normalizedDefaultModel)) {
    throw new ImageModelError("預設模型必須包含在開放模型清單中");
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
}) => withImageModelTransaction(tenantId, async (client) => {
  await ensureModelPolicy(tenantId, client);
  const models = await listPublicImageModels(tenantId, client);
  const normalized = validateModelPolicy({ allowedModels, defaultModel, models });
  const result = await client.query(
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
});

module.exports = {
  ensureModelPolicy,
  mapPolicy,
  normalizeModels,
  updateModelPolicy,
  validateModelPolicy,
};
