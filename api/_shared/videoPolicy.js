const { query } = require("./db");
const { VideoModelError } = require("./videoModelFamilies");
const { withVideoModelTransaction } = require("./videoModels");

const DEFAULT_SETTINGS = Object.freeze({
  allowedModels: [],
  dailyQuotaPerUser: 5,
  submitsPerMinute: 2,
});

const mapSettings = (row) => ({
  allowedModels: row?.allowed_models || [],
  dailyQuotaPerUser: Number(row?.daily_quota_per_user || DEFAULT_SETTINGS.dailyQuotaPerUser),
  submitsPerMinute: Number(row?.submits_per_minute || DEFAULT_SETTINGS.submitsPerMinute),
});

const ensureVideoSettings = async (tenantId, client) => {
  const action = (executor) => executor.query(
    `INSERT INTO tenant_video_settings (tenant_id)
     VALUES ($1)
     ON CONFLICT (tenant_id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id
     RETURNING allowed_models, daily_quota_per_user, submits_per_minute`,
    [tenantId]
  );
  const result = client ? await action(client) : await query(
    `INSERT INTO tenant_video_settings (tenant_id)
     VALUES ($1)
     ON CONFLICT (tenant_id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id
     RETURNING allowed_models, daily_quota_per_user, submits_per_minute`,
    [tenantId]
  );
  return mapSettings(result.rows[0]);
};

const updateVideoSettings = async ({
  tenantId,
  allowedModels,
  dailyQuotaPerUser,
  submitsPerMinute,
  updatedBy,
}) =>
  withVideoModelTransaction(tenantId, async (client) => {
    const registered = await client.query(
      "SELECT model_key FROM video_models WHERE tenant_id = $1",
      [tenantId]
    );
    const keys = new Set(registered.rows.map((row) => row.model_key));
    if (!Array.isArray(allowedModels) || allowedModels.some((key) => !keys.has(key))) {
      throw new VideoModelError("影片模型開放清單含有未登錄的模型");
    }
    const normalized = [...new Set(allowedModels)];
    const dailyQuota = Number(dailyQuotaPerUser);
    const perMinute = Number(submitsPerMinute);
    if (!Number.isInteger(dailyQuota) || dailyQuota < 1 || dailyQuota > 100) {
      throw new VideoModelError("每人每日額度必須介於 1 與 100");
    }
    if (!Number.isInteger(perMinute) || perMinute < 1 || perMinute > 40) {
      throw new VideoModelError("每分鐘送出上限必須介於 1 與 40");
    }
    const result = await client.query(
      `INSERT INTO tenant_video_settings
         (tenant_id, allowed_models, daily_quota_per_user, submits_per_minute, updated_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (tenant_id) DO UPDATE SET
         allowed_models = EXCLUDED.allowed_models,
         daily_quota_per_user = EXCLUDED.daily_quota_per_user,
         submits_per_minute = EXCLUDED.submits_per_minute,
         updated_by = EXCLUDED.updated_by,
         updated_at = now()
       RETURNING allowed_models, daily_quota_per_user, submits_per_minute`,
      [tenantId, normalized, dailyQuota, perMinute, updatedBy || null]
    );
    return mapSettings(result.rows[0]);
  });

module.exports = {
  ensureVideoSettings,
  updateVideoSettings,
};
