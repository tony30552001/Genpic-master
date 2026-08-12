const { ok, error, options } = require("../_shared/http");
const { requireAuth } = require("../_shared/auth");
const { rateLimit } = require("../_shared/rateLimit");
const { getCatalog, isConfigured } = require("../_shared/pptMasterClient");

const CACHE_TTL_MS = 10 * 60 * 1000;
const INCLUDE_BRANDS = process.env.PPT_MASTER_INCLUDE_BRANDS === "true";

let cache = null;

const toList = (entries) =>
  (Array.isArray(entries) ? entries : [])
    .map((entry) => ({
      id: String(entry?.id || ""),
      summary: String(entry?.summary || "").trim(),
      keywords: Array.isArray(entry?.keywords)
        ? entry.keywords.map((keyword) => String(keyword))
        : [],
    }))
    .filter((entry) => entry.id)
    .sort((a, b) => a.id.localeCompare(b.id));

const buildCatalog = async () => {
  const raw = await getCatalog();
  const catalog = {
    styles: toList(raw?.style),
    layouts: toList(raw?.layout),
  };
  if (INCLUDE_BRANDS) {
    catalog.brands = toList(raw?.brand);
  }
  return catalog;
};

module.exports = async function (context, req) {
  const method = (req.method || "").toUpperCase();
  if (method === "OPTIONS") {
    context.res = options(req);
    return;
  }
  if (method !== "GET") {
    context.res = error("不支援的請求方法", "method_not_allowed", 405, req);
    return;
  }

  const auth = await requireAuth(context, req);
  if (!auth) return;

  const limited = rateLimit(req, auth.user);
  if (limited.limited) {
    context.res = error("請求過於頻繁，請稍後再試", "rate_limited", 429, req);
    return;
  }

  if (!isConfigured()) {
    context.res = error(
      "PPT Master 服務尚未設定，請聯絡管理員",
      "service_unavailable",
      503,
      req
    );
    return;
  }

  if (!cache || Date.now() - cache.at > CACHE_TTL_MS) {
    cache = { at: Date.now(), value: await buildCatalog() };
  }

  context.res = ok(cache.value, 200, req);
};
