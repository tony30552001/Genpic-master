const { error, options } = require("../_shared/http");
const { requireAuth } = require("../_shared/auth");
const { rateLimit } = require("../_shared/rateLimit");

/**
 * The arbitrary Blob SAS contract has been retired. Keep this route during
 * the stale-bundle drain so callers receive a deterministic migration error
 * instead of a signer that accepts caller-controlled paths and containers.
 */
module.exports = async function (context, req) {
  if ((req.method || "").toUpperCase() === "OPTIONS") {
    context.res = options();
    return;
  }

  const auth = await requireAuth(context, req);
  if (!auth) return;

  const limited = rateLimit(req, auth.user);
  if (limited.limited) {
    context.res = error("請求過於頻繁", "rate_limited", 429);
    return;
  }

  context.res = error(
    "舊版 Blob SAS API 已停用，請改用 /api/uploads",
    "upload_api_replaced",
    410
  );
};
