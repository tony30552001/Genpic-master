const { query, getPool } = require("./db");
const { encrypt, decrypt } = require("./secretCrypto");
const {
  IMAGE_API_TYPES,
  IMAGE_QUALITIES,
  ImageModelError,
  normalizeImageEndpoint,
} = require("./imageModelConfig");

const MODEL_COLUMNS = `model_key, label, api_type, deployment_name, endpoint,
  supported_qualities, default_quality,
  (api_key_encrypted IS NOT NULL) AS has_api_key, created_at, updated_at`;
const MODEL_KEY = /^[a-z0-9][a-z0-9._-]{0,127}$/;

const execute = (client, text, params) =>
  client ? client.query(text, params) : query(text, params);
const timestamp = (value) =>
  value ? { seconds: Math.floor(new Date(value).getTime() / 1000) } : null;

const publicImageModel = (row) => ({
  modelKey: row.model_key,
  label: row.label,
  apiType: row.api_type,
  supportedQualities: row.supported_qualities,
  defaultQuality: row.default_quality,
});

const mapImageModel = (row) => ({
  ...publicImageModel(row),
  deploymentName: row.deployment_name,
  endpoint: row.endpoint,
  hasApiKey: Boolean(row.has_api_key),
  createdAt: timestamp(row.created_at),
  updatedAt: timestamp(row.updated_at),
});

const requiredText = (value, label, maxLength = 128) => {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) {
    throw new ImageModelError(`${label}必須是 1 至 ${maxLength} 字元的文字`);
  }
  return value.trim();
};

const validateImageModelInput = (input) => {
  const modelKey = requiredText(input.modelKey, "模型識別碼");
  if (!MODEL_KEY.test(modelKey)) {
    throw new ImageModelError("模型識別碼只能使用小寫英數字、句點、底線與連字號");
  }
  if (!IMAGE_API_TYPES.some(({ id }) => id === input.apiType)) {
    throw new ImageModelError("不支援的圖片 API 類型");
  }
  if (
    !Array.isArray(input.supportedQualities) ||
    input.supportedQualities.length === 0 ||
    input.supportedQualities.some((value) => !IMAGE_QUALITIES.includes(value))
  ) {
    throw new ImageModelError("請選擇至少一種有效的圖片品質");
  }
  const supportedQualities = IMAGE_QUALITIES.filter((value) =>
    input.supportedQualities.includes(value)
  );
  if (!supportedQualities.includes(input.defaultQuality)) {
    throw new ImageModelError("預設品質必須包含在支援品質中");
  }
  return {
    modelKey,
    label: requiredText(input.label, "模型名稱"),
    apiType: input.apiType,
    deploymentName: requiredText(input.deploymentName, "部署名稱"),
    endpoint: normalizeImageEndpoint(input.endpoint),
    supportedQualities,
    defaultQuality: input.defaultQuality,
  };
};

// Admission, policy changes and catalog mutations take the same short tenant lock.
const withImageModelTransaction = async (tenantId, action) => {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const tenant = await client.query(
      "SELECT id FROM tenants WHERE id = $1 FOR UPDATE",
      [tenantId]
    );
    if (!tenant.rows.length) {
      throw new ImageModelError("找不到租戶", "not_found", 404);
    }
    const result = await action(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const listImageModels = async (tenantId, client) => {
  const result = await execute(
    client,
    `SELECT ${MODEL_COLUMNS} FROM image_models
     WHERE tenant_id = $1 ORDER BY lower(label), model_key`,
    [tenantId]
  );
  return result.rows.map(mapImageModel);
};

const listPublicImageModels = async (tenantId, client) => {
  const result = await execute(
    client,
    `SELECT model_key, label, api_type, supported_qualities, default_quality
     FROM image_models WHERE tenant_id = $1 ORDER BY lower(label), model_key`,
    [tenantId]
  );
  return result.rows.map(publicImageModel);
};

const resolveImageModel = async ({ tenantId, modelKey, client }) => {
  if (!modelKey) {
    throw new ImageModelError("尚未設定圖片模型，請聯絡管理員", "image_model_not_configured", 503);
  }
  const result = await execute(
    client,
    `SELECT ${MODEL_COLUMNS}, api_key_encrypted FROM image_models
     WHERE tenant_id = $1 AND model_key = $2`,
    [tenantId, modelKey]
  );
  const row = result.rows[0];
  if (!row) {
    throw new ImageModelError("圖片模型尚未登錄，請聯絡管理員", "image_model_not_configured", 503);
  }
  let apiKey;
  try {
    apiKey = decrypt(row.api_key_encrypted);
  } catch {
    throw new ImageModelError("圖片模型金鑰無法解密，請聯絡管理員", "image_model_not_configured", 503);
  }
  if (!apiKey) {
    throw new ImageModelError("圖片模型缺少金鑰，請聯絡管理員", "image_model_not_configured", 503);
  }
  return {
    ...publicImageModel(row),
    deploymentName: row.deployment_name,
    endpoint: row.endpoint,
    apiKey,
  };
};

const assertNoActiveImageWork = async (client, tenantId, modelKey) => {
  const result = await client.query(
    `SELECT id FROM image_generation_jobs
     WHERE tenant_id = $1 AND model = $2 AND status IN ('queued', 'processing')
     UNION ALL
     SELECT id FROM deck_generation_jobs
     WHERE tenant_id = $1 AND image_model_key = $2 AND status IN ('queued', 'processing')
     LIMIT 1`,
    [tenantId, modelKey]
  );
  if (result.rows.length) {
    throw new ImageModelError("此模型仍有工作執行中，請完成後再修改連線或刪除", "conflict", 409);
  }
};

const rethrowCatalogError = (error) => {
  if (error?.code === "23505") {
    throw new ImageModelError("此租戶已有相同識別碼或名稱的圖片模型", "conflict", 409);
  }
  throw error;
};

const createImageModel = async ({ tenantId, createdBy, apiKey, ...input }) => {
  const model = validateImageModelInput(input);
  const key = requiredText(apiKey, "API 金鑰", 4096);
  try {
    return await withImageModelTransaction(tenantId, async (client) => {
      const result = await client.query(
        `INSERT INTO image_models
           (tenant_id, model_key, label, api_type, deployment_name, endpoint,
            api_key_encrypted, supported_qualities, default_quality, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
         RETURNING ${MODEL_COLUMNS}`,
        [
          tenantId, model.modelKey, model.label, model.apiType, model.deploymentName,
          model.endpoint, encrypt(key), model.supportedQualities, model.defaultQuality,
          createdBy || null,
        ]
      );
      return mapImageModel(result.rows[0]);
    });
  } catch (error) {
    rethrowCatalogError(error);
  }
};

const updateImageModel = async ({ tenantId, updatedBy, apiKey, ...input }) => {
  const model = validateImageModelInput(input);
  if (apiKey !== undefined && typeof apiKey !== "string") {
    throw new ImageModelError("API 金鑰必須是文字");
  }
  const key = apiKey?.trim() ? requiredText(apiKey, "API 金鑰", 4096) : null;
  try {
    return await withImageModelTransaction(tenantId, async (client) => {
      const existing = await client.query(
        `SELECT ${MODEL_COLUMNS} FROM image_models WHERE tenant_id = $1 AND model_key = $2`,
        [tenantId, model.modelKey]
      );
      const row = existing.rows[0];
      if (!row) throw new ImageModelError("找不到圖片模型", "not_found", 404);
      if (row.api_type !== model.apiType || row.deployment_name !== model.deploymentName) {
        throw new ImageModelError("API 類型與部署名稱不可變更，請新增另一個模型");
      }
      const changesRuntime =
        row.endpoint !== model.endpoint ||
        row.default_quality !== model.defaultQuality ||
        JSON.stringify(row.supported_qualities) !== JSON.stringify(model.supportedQualities);
      if (changesRuntime) {
        await assertNoActiveImageWork(client, tenantId, model.modelKey);
      }
      const result = await client.query(
        `UPDATE image_models
         SET label = $3, endpoint = $4, supported_qualities = $5, default_quality = $6,
             api_key_encrypted = COALESCE($7, api_key_encrypted),
             updated_by = $8, updated_at = now()
         WHERE tenant_id = $1 AND model_key = $2
         RETURNING ${MODEL_COLUMNS}`,
        [
          tenantId, model.modelKey, model.label, model.endpoint, model.supportedQualities,
          model.defaultQuality, key ? encrypt(key) : null, updatedBy || null,
        ]
      );
      return mapImageModel(result.rows[0]);
    });
  } catch (error) {
    rethrowCatalogError(error);
  }
};

const deleteImageModel = async ({ tenantId, modelKey }) =>
  withImageModelTransaction(tenantId, async (client) => {
    const referenced = await client.query(
      `SELECT tenant_id FROM tenant_model_settings
       WHERE tenant_id = $1 AND (default_model = $2 OR $2 = ANY(allowed_models))`,
      [tenantId, modelKey]
    );
    if (referenced.rows.length) {
      throw new ImageModelError("請先從開放模型與預設模型政策移除此模型", "conflict", 409);
    }
    await assertNoActiveImageWork(client, tenantId, modelKey);
    const result = await client.query(
      "DELETE FROM image_models WHERE tenant_id = $1 AND model_key = $2 RETURNING model_key",
      [tenantId, modelKey]
    );
    if (!result.rows.length) throw new ImageModelError("找不到圖片模型", "not_found", 404);
  });

module.exports = {
  createImageModel,
  deleteImageModel,
  listImageModels,
  listPublicImageModels,
  resolveImageModel,
  updateImageModel,
  validateImageModelInput,
  withImageModelTransaction,
};
