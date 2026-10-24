const { ok, error, options } = require("../_shared/http");
const { requireAuth } = require("../_shared/auth");
const { rateLimit } = require("../_shared/rateLimit");
const { resolveIdentity } = require("../_shared/identity");
const { ImageChatRequestError } = require("../_shared/imageChats");
const memory = require("../_shared/imageChatMemory");

module.exports = async function (context, req) {
  const method = (req.method || "").toUpperCase();
  if (method === "OPTIONS") {
    context.res = options(req);
    return;
  }

  const auth = await requireAuth(context, req);
  if (!auth) return;

  const limited = rateLimit(req, auth.user);
  if (limited.limited) {
    context.res = error("請求過於頻繁", "rate_limited", 429, req);
    return;
  }

  const { tenantId, userId } = await resolveIdentity(auth.user);
  if (!userId || !tenantId) {
    context.res = error("無法辨識使用者", "unauthorized", 401, req);
    return;
  }
  const owner = { tenantId, userId };

  try {
    if (method === "GET") {
      context.res = ok(await memory.getMemory(owner), 200, req);
    } else if (method === "PUT") {
      const content = memory.validateMemoryRequest(req.body);
      context.res = ok(await memory.saveMemory({ ...owner, content }), 200, req);
    } else {
      context.res = error("不支援的方法", "method_not_allowed", 405, req);
    }
  } catch (err) {
    if (err instanceof ImageChatRequestError) {
      context.res = error(err.message, err.code, err.status, req);
      return;
    }
    context.log.error("Image chat memory request failed:", { code: err?.code });
    context.res = error("偏好記憶暫時無法使用", "memory_failed", 500, req);
  }
};
