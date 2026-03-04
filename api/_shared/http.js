/**
 * CORS Origin 白名單設定
 * 從環境變數 CORS_ALLOW_ORIGIN 讀取，支援逗號分隔多個 Origin
 * 範例: "https://genpic.edgentauems.com.tw,http://localhost:5175"
 * 本地開發: 設為 "*" (local.settings.json，已在 .gitignore 中)
 */
const ALLOWED_ORIGINS = (process.env.CORS_ALLOW_ORIGIN || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

/**
 * 計算正確的 Access-Control-Allow-Origin 值
 * @param {object|null} req - Azure Function request 物件（選用）
 * @returns {object} CORS headers
 */
const corsHeaders = (req) => {
  const requestOrigin = req?.headers?.origin || "";

  // 開發模式：CORS_ALLOW_ORIGIN 包含 "*" 或未設定
  const isWildcard = ALLOWED_ORIGINS.includes("*") || ALLOWED_ORIGINS.length === 0;
  if (isWildcard) {
    return {
      "Access-Control-Allow-Origin": requestOrigin || "*",
      "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Authorization,Content-Type,X-Auth-Token",
    };
  }

  // 生產模式：單一 Origin（最常見情況，直接回傳，不需動態比對）
  if (ALLOWED_ORIGINS.length === 1) {
    return {
      "Access-Control-Allow-Origin": ALLOWED_ORIGINS[0],
      "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Authorization,Content-Type,X-Auth-Token",
      "Vary": "Origin",
    };
  }

  // 多 Origin 模式：動態比對 request Origin
  const allowOrigin = requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)
    ? requestOrigin
    : "";

  return {
    ...(allowOrigin ? { "Access-Control-Allow-Origin": allowOrigin } : {}),
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization,Content-Type,X-Auth-Token",
    "Vary": "Origin",
  };
};

// ─── Response Helpers ────────────────────────────────────────────────────────
// req 參數為選用，向後相容現有所有 API 呼叫端（不傳 req 也能正常運作）

const ok = (body, status = 200, req = null) => ({
  status,
  headers: { "Content-Type": "application/json", ...corsHeaders(req) },
  body,
});

const error = (message, code = "unknown", status = 400, req = null) => ({
  status,
  headers: { "Content-Type": "application/json", ...corsHeaders(req) },
  body: { error: { code, message } },
});

const options = (req = null) => ({
  status: 204,
  headers: { ...corsHeaders(req) },
});

module.exports = { ok, error, options, corsHeaders };
