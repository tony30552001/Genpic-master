const { getPool, query } = require("./db");
const { decrypt, encrypt } = require("./secretCrypto");
const {
  VideoModelError,
  getVideoModelFamily,
  listVideoFamilies,
} = require("./videoModelFamilies");

const MODEL_COLUMNS = `model_key, label, family, endpoint, deployment_name,
  max_duration_seconds, max_resolution, allow_audio,
  (api_key_encrypted IS NOT NULL) AS has_api_key, created_at, updated_at`;
const MODEL_KEY = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const execute = (client, text, params) => client ? client.query(text, params) : query(text, params);
const timestamp = (value) =>
  value ? { seconds: Math.floor(new Date(value).getTime() / 1000) } : null;

const requiredText = (value, label, maxLength = 128) => {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) {
    throw new VideoModelError(`${label}必須是 1 至 ${maxLength} 字元的文字`);
  }
  return value.trim();
};

const normalizeVideoEndpoint = (value) => {
  const text = requiredText(value, "Foundry 端點", 512);
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new VideoModelError("Foundry 端點格式無效");
  }
  if (
    url.protocol !== "https:" ||
    !/^[a-z0-9-]+\.services\.ai\.azure\.com$/i.test(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/providers/falai/v1"
  ) {
    throw new VideoModelError("端點必須是 https://<resource>.services.ai.azure.com/providers/falai/v1");
  }
  return url.toString().replace(/\/$/, "");
};

const validateVideoModelInput = (input) => {
  const modelKey = requiredText(input.modelKey, "模型識別碼");
  if (!MODEL_KEY.test(modelKey)) {
    throw new VideoModelError("模型識別碼只能使用小寫英數字、句點、底線與連字號");
  }
  const family = getVideoModelFamily(input.family);
  const maxDurationSeconds = Number(input.maxDurationSeconds);
  if (
    !Number.isInteger(maxDurationSeconds) ||
    maxDurationSeconds < family.minDuration ||
    maxDurationSeconds > family.maxDuration
  ) {
    throw new VideoModelError(`最長秒數必須介於 ${family.minDuration} 與 ${family.maxDuration}`);
  }
  const maxResolution = family.supportsAudioToggle
    ? null
    : input.maxResolution || family.defaultResolution;
  if (maxResolution && !family.resolutions.includes(maxResolution)) {
    throw new VideoModelError("不支援的最高解析度");
  }
  return {
    modelKey,
    label: requiredText(input.label, "模型名稱"),
    family: family.id,
    endpoint: normalizeVideoEndpoint(input.endpoint),
    deploymentName: requiredText(input.deploymentName, "部署名稱"),
    maxDurationSeconds,
    maxResolution,
    allowAudio: family.supportsAudioToggle ? Boolean(input.allowAudio) : true,
  };
};

const publicVideoModel = (row) => ({
  modelKey: row.model_key,
  label: row.label,
  family: row.family,
  maxDurationSeconds: row.max_duration_seconds,
  maxResolution: row.max_resolution,
  allowAudio: Boolean(row.allow_audio),
  capabilities: getVideoModelFamily(row.family) && {
    minDuration: getVideoModelFamily(row.family).minDuration,
    maxDuration: getVideoModelFamily(row.family).maxDuration,
    resolutions: getVideoModelFamily(row.family).resolutions,
    aspectRatios: getVideoModelFamily(row.family).aspectRatios,
    supportsAudioToggle: getVideoModelFamily(row.family).supportsAudioToggle,
    fixedAudio: getVideoModelFamily(row.family).fixedAudio,
    estimatedSeconds: getVideoModelFamily(row.family).estimatedSeconds,
  },
});

const mapVideoModel = (row) => ({
  ...publicVideoModel(row),
  endpoint: row.endpoint,
  deploymentName: row.deployment_name,
  hasApiKey: Boolean(row.has_api_key),
  createdAt: timestamp(row.created_at),
  updatedAt: timestamp(row.updated_at),
});

const withVideoModelTransaction = async (tenantId, action) => {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const tenant = await client.query("SELECT id FROM tenants WHERE id = $1 FOR UPDATE", [tenantId]);
    if (!tenant.rows.length) throw new VideoModelError("找不到租戶", "not_found", 404);
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

const listVideoModels = async (tenantId, client) => {
  const result = await execute(
    client,
    `SELECT ${MODEL_COLUMNS} FROM video_models WHERE tenant_id = $1 ORDER BY lower(label), model_key`,
    [tenantId]
  );
  return result.rows.map(mapVideoModel);
};

const listPublicVideoModels = async (tenantId, client) => {
  const result = await execute(
    client,
    `SELECT model_key, label, family, max_duration_seconds, max_resolution, allow_audio
     FROM video_models WHERE tenant_id = $1 ORDER BY lower(label), model_key`,
    [tenantId]
  );
  return result.rows.map(publicVideoModel);
};

const resolveVideoModel = async ({ tenantId, modelKey, client }) => {
  const result = await execute(
    client,
    `SELECT ${MODEL_COLUMNS}, api_key_encrypted FROM video_models
     WHERE tenant_id = $1 AND model_key = $2`,
    [tenantId, modelKey]
  );
  const row = result.rows[0];
  if (!row) throw new VideoModelError("影片模型尚未登錄，請聯絡管理員", "video_model_not_configured", 503);
  let apiKey;
  try {
    apiKey = decrypt(row.api_key_encrypted);
  } catch {
    throw new VideoModelError("影片模型金鑰無法解密，請聯絡管理員", "video_model_not_configured", 503);
  }
  if (!apiKey) {
    throw new VideoModelError("影片模型缺少金鑰，請聯絡管理員", "video_model_not_configured", 503);
  }
  return {
    ...publicVideoModel(row),
    endpoint: row.endpoint,
    deploymentName: row.deployment_name,
    apiKey,
  };
};

const rethrowCatalogError = (error) => {
  if (error?.code === "23505") {
    throw new VideoModelError("此租戶已有相同識別碼或名稱的影片模型", "conflict", 409);
  }
  throw error;
};

const assertNoActiveVideoWork = async (client, tenantId, modelKey) => {
  const result = await client.query(
    `SELECT id FROM video_generation_jobs
     WHERE tenant_id = $1 AND model_key = $2 AND status IN ('queued', 'processing') LIMIT 1`,
    [tenantId, modelKey]
  );
  if (result.rows.length) {
    throw new VideoModelError("此模型仍有工作執行中，請完成後再修改或刪除", "conflict", 409);
  }
};

const createVideoModel = async ({ tenantId, createdBy, apiKey, ...input }) => {
  const model = validateVideoModelInput(input);
  const key = requiredText(apiKey, "API 金鑰", 4096);
  try {
    return await withVideoModelTransaction(tenantId, async (client) => {
      const result = await client.query(
        `INSERT INTO video_models
         (tenant_id, model_key, label, family, endpoint, deployment_name,
          api_key_encrypted, max_duration_seconds, max_resolution, allow_audio, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
         RETURNING ${MODEL_COLUMNS}`,
        [tenantId, model.modelKey, model.label, model.family, model.endpoint, model.deploymentName,
          encrypt(key), model.maxDurationSeconds, model.maxResolution, model.allowAudio, createdBy || null]
      );
      return mapVideoModel(result.rows[0]);
    });
  } catch (error) {
    rethrowCatalogError(error);
  }
};

const updateVideoModel = async ({ tenantId, updatedBy, apiKey, ...input }) => {
  const model = validateVideoModelInput(input);
  const key = apiKey?.trim() ? requiredText(apiKey, "API 金鑰", 4096) : null;
  try {
    return await withVideoModelTransaction(tenantId, async (client) => {
      const existing = await client.query(
        `SELECT ${MODEL_COLUMNS} FROM video_models WHERE tenant_id = $1 AND model_key = $2`,
        [tenantId, model.modelKey]
      );
      const row = existing.rows[0];
      if (!row) throw new VideoModelError("找不到影片模型", "not_found", 404);
      if (row.family !== model.family || row.deployment_name !== model.deploymentName) {
        throw new VideoModelError("模型家族與部署名稱不可變更，請新增另一個模型");
      }
      if (
        row.endpoint !== model.endpoint ||
        row.max_duration_seconds !== model.maxDurationSeconds ||
        row.max_resolution !== model.maxResolution ||
        Boolean(row.allow_audio) !== model.allowAudio
      ) {
        await assertNoActiveVideoWork(client, tenantId, model.modelKey);
      }
      const result = await client.query(
        `UPDATE video_models
         SET label = $3, endpoint = $4, max_duration_seconds = $5, max_resolution = $6,
             allow_audio = $7, api_key_encrypted = COALESCE($8, api_key_encrypted),
             updated_by = $9, updated_at = now()
         WHERE tenant_id = $1 AND model_key = $2
         RETURNING ${MODEL_COLUMNS}`,
        [tenantId, model.modelKey, model.label, model.endpoint, model.maxDurationSeconds,
          model.maxResolution, model.allowAudio, key ? encrypt(key) : null, updatedBy || null]
      );
      return mapVideoModel(result.rows[0]);
    });
  } catch (error) {
    rethrowCatalogError(error);
  }
};

const deleteVideoModel = async ({ tenantId, modelKey }) =>
  withVideoModelTransaction(tenantId, async (client) => {
    const settings = await client.query(
      "SELECT allowed_models FROM tenant_video_settings WHERE tenant_id = $1",
      [tenantId]
    );
    if (settings.rows[0]?.allowed_models?.includes(modelKey)) {
      throw new VideoModelError("請先從影片模型開放清單移除此模型", "conflict", 409);
    }
    await assertNoActiveVideoWork(client, tenantId, modelKey);
    const result = await client.query(
      "DELETE FROM video_models WHERE tenant_id = $1 AND model_key = $2 RETURNING model_key",
      [tenantId, modelKey]
    );
    if (!result.rows.length) throw new VideoModelError("找不到影片模型", "not_found", 404);
  });

module.exports = {
  createVideoModel,
  deleteVideoModel,
  listVideoFamilies,
  listPublicVideoModels,
  listVideoModels,
  normalizeVideoEndpoint,
  resolveVideoModel,
  updateVideoModel,
  validateVideoModelInput,
  withVideoModelTransaction,
};
