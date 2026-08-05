const { ok, error, options } = require("../_shared/http");
const { requireAdmin } = require("../_shared/admin");
const { rateLimit } = require("../_shared/rateLimit");
const { query } = require("../_shared/db");
const {
  ensureModelPolicy,
  SUPPORTED_IMAGE_MODELS,
  updateModelPolicy,
} = require("../_shared/modelPolicy");

const timestamp = (value) =>
  value ? { seconds: Math.floor(new Date(value).getTime() / 1000) } : null;

const getResource = (context, req) =>
  req.params?.resource ||
  context.bindingData?.resource ||
  req.query?.resource ||
  "users";

const getTargetId = (context, req) =>
  req.params?.id || context.bindingData?.id || req.query?.id;

const mapUser = (row) => ({
  id: row.id,
  email: row.email,
  displayName: row.display_name || row.email,
  role: row.role,
  isActive: row.is_active !== false,
  createdAt: timestamp(row.created_at),
  generationCount: Number(row.generation_count || 0),
  styleCount: Number(row.style_count || 0),
});

const mapUserOption = (row) => ({
  id: row.id,
  email: row.email,
  displayName: row.display_name || row.email,
  role: row.role,
  isActive: row.is_active !== false,
});

const mapHistory = (row) => ({
  id: row.id,
  imageUrl: row.image_url,
  fullPrompt: row.prompt,
  userScript: row.user_script,
  stylePrompt: row.style_prompt,
  model: row.model,
  styleId: row.style_id,
  styleName: row.style_name,
  userId: row.user_id,
  userEmail: row.user_email,
  userDisplayName: row.user_display_name || row.user_email,
  createdAt: timestamp(row.created_at),
});

const mapStyle = (row) => ({
  id: row.id,
  name: row.name,
  prompt: row.prompt,
  description: row.description,
  tags: row.tags || [],
  previewUrl: row.preview_url,
  category: row.category || "general",
  visibility: row.visibility || "private",
  isCurated: Boolean(row.is_curated),
  usageCount: Number(row.usage_count || 0),
  copyCount: Number(row.copy_count || 0),
  createdBy: row.created_by,
  authorEmail: row.author_email,
  authorName: row.author_name || row.author_email,
  createdAt: timestamp(row.created_at),
  updatedAt: timestamp(row.updated_at || row.created_at),
});

const parsePositiveInt = (value, fallback, maximum) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), 1), maximum);
};

const getUserPagination = (req) => ({
  page: parsePositiveInt(req.query?.page, 1, Number.MAX_SAFE_INTEGER),
  pageSize: parsePositiveInt(req.query?.pageSize, 10, 100),
});

const listUsers = async (context, identity, req) => {
  const { page, pageSize } = getUserPagination(req);
  const countResult = await query(
    "SELECT COUNT(*)::int AS total FROM users WHERE tenant_id = $1",
    [identity.tenantId]
  );
  const total = Number(countResult.rows[0]?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const offset = (currentPage - 1) * pageSize;

  const result = await query(
    `SELECT
       u.id,
       u.email,
       u.display_name,
       u.role,
       u.is_active,
       u.created_at,
       (SELECT COUNT(*) FROM history h
        WHERE h.user_id = u.id AND h.tenant_id = u.tenant_id) AS generation_count,
       (SELECT COUNT(*) FROM styles s
        WHERE s.created_by = u.id AND s.tenant_id = u.tenant_id) AS style_count
     FROM users u
     WHERE u.tenant_id = $1
     ORDER BY u.created_at DESC
     LIMIT $2 OFFSET $3`,
    [identity.tenantId, pageSize, offset]
  );
  context.res = ok(
    {
      items: result.rows.map(mapUser),
      pagination: {
        page: currentPage,
        pageSize,
        total,
        totalPages,
      },
    },
    200,
    req
  );
};

const listUserOptions = async (context, identity, req) => {
  const result = await query(
    `SELECT id, email, display_name, role, is_active
     FROM users
     WHERE tenant_id = $1
     ORDER BY display_name ASC NULLS LAST, email ASC`,
    [identity.tenantId]
  );
  context.res = ok(result.rows.map(mapUserOption), 200, req);
};

const listHistory = async (context, identity, req) => {
  const params = [identity.tenantId];
  const where = ["h.tenant_id = $1"];
  const userId = String(req.query?.userId || "").trim();
  if (userId) {
    params.push(userId);
    where.push(`h.user_id = $${params.length}`);
  }

  const requestedLimit = Number(req.query?.limit || 50);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 100)
    : 50;
  params.push(limit);

  const result = await query(
    `SELECT
       h.id,
       h.image_url,
       h.prompt,
       h.user_script,
       h.style_prompt,
       h.model,
       h.style_id,
       h.created_at,
       h.user_id,
       u.email AS user_email,
       u.display_name AS user_display_name,
       s.name AS style_name
     FROM history h
     LEFT JOIN users u ON u.id = h.user_id
     LEFT JOIN styles s ON s.id = h.style_id
     WHERE ${where.join(" AND ")}
     ORDER BY h.created_at DESC
     LIMIT $${params.length}`,
    params
  );

  context.res = ok(result.rows.map(mapHistory), 200, req);
};

const listStyles = async (context, identity, req) => {
  const params = [identity.tenantId];
  const where = ["s.tenant_id = $1"];
  const userId = String(req.query?.userId || "").trim();
  if (userId) {
    params.push(userId);
    where.push(`s.created_by = $${params.length}`);
  }

  const result = await query(
    `SELECT
       s.id,
       s.name,
       s.prompt,
       s.description,
       s.tags,
       s.preview_url,
       s.category,
       s.visibility,
       s.is_curated,
       s.usage_count,
       s.copy_count,
       s.created_by,
       s.created_at,
       s.updated_at,
       u.email AS author_email,
       u.display_name AS author_name
     FROM styles s
     LEFT JOIN users u ON u.id = s.created_by
     WHERE ${where.join(" AND ")}
     ORDER BY s.updated_at DESC NULLS LAST, s.created_at DESC`,
    params
  );

  context.res = ok(result.rows.map(mapStyle), 200, req);
};

const updateUser = async (context, identity, req, targetId) => {
  if (!targetId) {
    context.res = error("缺少 user id", "bad_request", 400, req);
    return;
  }

  const payload = req.body || {};
  const hasRole = payload.role !== undefined;
  const hasStatus = payload.isActive !== undefined;
  if (!hasRole && !hasStatus) {
    context.res = error("缺少使用者更新內容", "bad_request", 400, req);
    return;
  }

  const current = await query(
    "SELECT id, role, is_active FROM users WHERE id = $1 AND tenant_id = $2 LIMIT 1",
    [targetId, identity.tenantId]
  );
  if (current.rows.length === 0) {
    context.res = error("找不到使用者", "not_found", 404, req);
    return;
  }

  const currentUser = current.rows[0];
  const role = hasRole ? String(payload.role || "").trim() : currentUser.role;
  const isActive = hasStatus ? payload.isActive : currentUser.is_active;

  if (hasRole && !["admin", "editor", "viewer"].includes(role)) {
    context.res = error("不支援的使用者角色", "bad_request", 400, req);
    return;
  }

  if (hasStatus && typeof isActive !== "boolean") {
    context.res = error("使用者啟用狀態格式錯誤", "bad_request", 400, req);
    return;
  }

  if (hasStatus && !isActive && targetId === identity.userId) {
    context.res = error("不能停用目前登入的管理員帳號", "bad_request", 400, req);
    return;
  }

  if (
    currentUser.role === "admin" &&
    currentUser.is_active &&
    (role !== "admin" || !isActive)
  ) {
    const adminCount = await query(
      "SELECT COUNT(*) AS count FROM users WHERE tenant_id = $1 AND role = 'admin' AND is_active = true",
      [identity.tenantId]
    );
    if (Number(adminCount.rows[0].count) <= 1) {
      context.res = error("系統至少需要保留一位管理員", "bad_request", 400, req);
      return;
    }
  }

  const result = await query(
    `WITH updated_user AS (
       UPDATE users
       SET role = $1, is_active = $2
       WHERE id = $3 AND tenant_id = $4
       RETURNING id, email, display_name, role, is_active, created_at, tenant_id
     )
     SELECT
       u.id,
       u.email,
       u.display_name,
       u.role,
       u.is_active,
       u.created_at,
       (SELECT COUNT(*) FROM history h
        WHERE h.user_id = u.id AND h.tenant_id = u.tenant_id) AS generation_count,
       (SELECT COUNT(*) FROM styles s
        WHERE s.created_by = u.id AND s.tenant_id = u.tenant_id) AS style_count
     FROM updated_user u`,
    [role, isActive, targetId, identity.tenantId]
  );
  context.res = ok(mapUser(result.rows[0]), 200, req);
};

const deleteStyle = async (context, identity, req, targetId) => {
  if (!targetId) {
    context.res = error("缺少 style id", "bad_request", 400, req);
    return;
  }

  await query(
    "UPDATE history SET style_id = NULL WHERE style_id = $1 AND tenant_id = $2",
    [targetId, identity.tenantId]
  );
  const result = await query(
    "DELETE FROM styles WHERE id = $1 AND tenant_id = $2 RETURNING id",
    [targetId, identity.tenantId]
  );
  if (result.rows.length === 0) {
    context.res = error("找不到風格", "not_found", 404, req);
    return;
  }
  context.res = ok(null, 204, req);
};

module.exports = async function (context, req) {
  if ((req.method || "").toUpperCase() === "OPTIONS") {
    context.res = options(req);
    return;
  }

  const admin = await requireAdmin(context, req);
  if (!admin) return;

  const limited = rateLimit(req, admin.user);
  if (limited.limited) {
    context.res = error("請求過於頻繁", "rate_limited", 429, req);
    return;
  }

  const method = (req.method || "GET").toUpperCase();
  const resource = String(getResource(context, req)).toLowerCase();
  const targetId = getTargetId(context, req);
  const { identity } = admin;

  if (method === "GET" && resource === "users") {
    await listUsers(context, identity, req);
    return;
  }

  if (method === "GET" && resource === "user-options") {
    await listUserOptions(context, identity, req);
    return;
  }

  if (method === "GET" && resource === "history") {
    await listHistory(context, identity, req);
    return;
  }

  if (method === "GET" && resource === "styles") {
    await listStyles(context, identity, req);
    return;
  }

  if (method === "GET" && resource === "settings") {
    const modelPolicy = await ensureModelPolicy(identity.tenantId);
    context.res = ok(
      {
        modelPolicy,
        supportedModels: SUPPORTED_IMAGE_MODELS,
      },
      200,
      req
    );
    return;
  }

  if (method === "PUT" && resource === "settings") {
    try {
      await ensureModelPolicy(identity.tenantId);
      const modelPolicy = await updateModelPolicy({
        tenantId: identity.tenantId,
        allowedModels: req.body?.allowedModels,
        defaultModel: req.body?.defaultModel,
        updatedBy: identity.userId,
      });
      context.res = ok(
        {
          modelPolicy,
          supportedModels: SUPPORTED_IMAGE_MODELS,
        },
        200,
        req
      );
    } catch (err) {
      context.res = error(err.message, "bad_request", 400, req);
    }
    return;
  }

  if (method === "PUT" && resource === "users") {
    await updateUser(context, identity, req, targetId);
    return;
  }

  if (method === "DELETE" && resource === "styles") {
    await deleteStyle(context, identity, req, targetId);
    return;
  }

  context.res = error("Method not allowed", "method_not_allowed", 405, req);
};
