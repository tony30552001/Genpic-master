const { query } = require("./db");
const { decrypt, encrypt } = require("./secretCrypto");
const { DEFAULT_SPEECH_VOICE, SPEECH_VOICES, isValidSpeechVoice } = require("./speechTts");
const { isPublicHttpsEndpoint } = require("./urlValidator");
const { VideoModelError } = require("./videoModelFamilies");
const { withVideoModelTransaction } = require("./videoModels");

const SPEECH_REGION_PATTERN = /^[a-z0-9-]{2,40}$/;

const DEFAULT_SETTINGS = Object.freeze({
  allowedModels: [],
  dailyQuotaPerUser: 5,
  submitsPerMinute: 2,
  speechRegion: null,
  speechEndpoint: null,
  speechDefaultVoice: DEFAULT_SPEECH_VOICE,
});

const mapSettings = (row) => {
  const speechRegion = row?.speech_region || null;
  const speechEndpoint = row?.speech_endpoint || null;
  const hasSpeechKey = Boolean(row?.speech_api_key_encrypted);
  const speechDefaultVoice = isValidSpeechVoice(row?.speech_default_voice)
    ? row.speech_default_voice
    : DEFAULT_SPEECH_VOICE;
  return {
    allowedModels: row?.allowed_models || [],
    dailyQuotaPerUser: Number(row?.daily_quota_per_user || DEFAULT_SETTINGS.dailyQuotaPerUser),
    submitsPerMinute: Number(row?.submits_per_minute || DEFAULT_SETTINGS.submitsPerMinute),
    speechRegion,
    speechEndpoint,
    speechDefaultVoice,
    hasSpeechKey,
    speechEnabled: hasSpeechKey && Boolean(speechRegion || speechEndpoint),
    speechVoices: SPEECH_VOICES,
  };
};

const SETTINGS_COLUMNS = `allowed_models, daily_quota_per_user, submits_per_minute,
  speech_region, speech_endpoint, speech_api_key_encrypted, speech_default_voice`;

const ensureVideoSettings = async (tenantId, client) => {
  const sql = `INSERT INTO tenant_video_settings (tenant_id)
     VALUES ($1)
     ON CONFLICT (tenant_id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id
     RETURNING ${SETTINGS_COLUMNS}`;
  const result = client ? await client.query(sql, [tenantId]) : await query(sql, [tenantId]);
  return mapSettings(result.rows[0]);
};

const resolveSpeechConfig = async (tenantId, client) => {
  const sql = `SELECT speech_region, speech_endpoint, speech_api_key_encrypted, speech_default_voice
     FROM tenant_video_settings
     WHERE tenant_id = $1`;
  const result = client ? await client.query(sql, [tenantId]) : await query(sql, [tenantId]);
  const row = result.rows[0];
  if (!row?.speech_api_key_encrypted || (!row.speech_region && !row.speech_endpoint)) {
    return null;
  }
  return {
    apiKey: decrypt(row.speech_api_key_encrypted),
    region: row.speech_region || null,
    endpoint: row.speech_endpoint || null,
    defaultVoice: isValidSpeechVoice(row.speech_default_voice)
      ? row.speech_default_voice
      : DEFAULT_SPEECH_VOICE,
  };
};

const normalizeSpeechRegion = (value) => {
  if (value === undefined) return undefined;
  if (value === null || String(value).trim() === "") return null;
  const normalized = String(value).trim().toLowerCase();
  if (!SPEECH_REGION_PATTERN.test(normalized)) {
    throw new VideoModelError("Azure Speech 區域格式無效（例如 eastasia、westus2）");
  }
  return normalized;
};

const normalizeSpeechEndpoint = (value) => {
  if (value === undefined) return undefined;
  if (value === null || String(value).trim() === "") return null;
  const trimmed = String(value).trim();
  if (!isPublicHttpsEndpoint(trimmed)) {
    throw new VideoModelError("Azure Speech 自訂端點必須為公開的 HTTPS 網址");
  }
  return trimmed;
};

const normalizeSpeechVoice = (value) => {
  if (value === undefined) return undefined;
  if (!isValidSpeechVoice(value)) {
    throw new VideoModelError("指定的台灣中文語音不支援");
  }
  return value;
};

const updateVideoSettings = async ({
  tenantId,
  allowedModels,
  dailyQuotaPerUser,
  submitsPerMinute,
  speechRegion,
  speechEndpoint,
  speechApiKey,
  clearSpeechApiKey = false,
  speechDefaultVoice,
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

    const existing = await client.query(
      `SELECT speech_region, speech_endpoint, speech_api_key_encrypted, speech_default_voice
       FROM tenant_video_settings WHERE tenant_id = $1`,
      [tenantId]
    );
    const current = existing.rows[0] || {};
    const nextRegion =
      speechRegion === undefined ? current.speech_region || null : normalizeSpeechRegion(speechRegion);
    const nextEndpoint =
      speechEndpoint === undefined ? current.speech_endpoint || null : normalizeSpeechEndpoint(speechEndpoint);
    const nextVoice =
      speechDefaultVoice === undefined
        ? current.speech_default_voice || DEFAULT_SPEECH_VOICE
        : normalizeSpeechVoice(speechDefaultVoice);

    let nextKeyEncrypted = current.speech_api_key_encrypted || null;
    if (clearSpeechApiKey) {
      nextKeyEncrypted = null;
    } else if (typeof speechApiKey === "string" && speechApiKey.trim()) {
      nextKeyEncrypted = encrypt(speechApiKey.trim());
    }

    const result = await client.query(
      `INSERT INTO tenant_video_settings
         (tenant_id, allowed_models, daily_quota_per_user, submits_per_minute,
          speech_region, speech_endpoint, speech_api_key_encrypted, speech_default_voice, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (tenant_id) DO UPDATE SET
         allowed_models = EXCLUDED.allowed_models,
         daily_quota_per_user = EXCLUDED.daily_quota_per_user,
         submits_per_minute = EXCLUDED.submits_per_minute,
         speech_region = EXCLUDED.speech_region,
         speech_endpoint = EXCLUDED.speech_endpoint,
         speech_api_key_encrypted = EXCLUDED.speech_api_key_encrypted,
         speech_default_voice = EXCLUDED.speech_default_voice,
         updated_by = EXCLUDED.updated_by,
         updated_at = now()
       RETURNING ${SETTINGS_COLUMNS}`,
      [
        tenantId,
        normalized,
        dailyQuota,
        perMinute,
        nextRegion,
        nextEndpoint,
        nextKeyEncrypted,
        nextVoice,
        updatedBy || null,
      ]
    );
    return mapSettings(result.rows[0]);
  });

module.exports = {
  ensureVideoSettings,
  resolveSpeechConfig,
  updateVideoSettings,
};
