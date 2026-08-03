const { error } = require("./http");
const { requireAuth } = require("./auth");
const { resolveIdentity } = require("./identity");

const requireAdmin = async (context, req) => {
  const auth = await requireAuth(context, req);
  if (!auth) return null;

  const identity = await resolveIdentity(auth.user);
  const isLocalBypass =
    auth.user?.authType === "bypass" &&
    process.env.NODE_ENV !== "production" &&
    !process.env.WEBSITE_SITE_NAME;

  if (identity.role !== "admin" && !isLocalBypass) {
    context.res = error("需要系統管理員權限", "forbidden", 403, req);
    return null;
  }

  return { ...auth, identity };
};

module.exports = { requireAdmin };
