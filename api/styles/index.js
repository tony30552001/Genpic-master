const { ok, error, options } = require("../_shared/http");
const { requireAuth } = require("../_shared/auth");
const { rateLimit } = require("../_shared/rateLimit");
const { query } = require("../_shared/db");
const { resolveIdentity } = require("../_shared/identity");

const STYLE_CATEGORIES = new Set([
  "social",
  "presentation",
  "poster",
  "ecommerce",
  "education",
  "document",
  "brand",
  "general",
]);
const STYLE_VISIBILITIES = new Set(["private", "shared"]);
const DEFAULT_CATEGORY = "general";
const DEFAULT_VISIBILITY = "private";

const timestamp = (value) =>
  value ? { seconds: Math.floor(new Date(value).getTime() / 1000) } : null;

const normalizeTags = (tags) =>
  Array.isArray(tags)
    ? tags.map((tag) => String(tag).trim()).filter(Boolean)
    : [];

const normalizeCategory = (category) => {
  const value = String(category || DEFAULT_CATEGORY).trim();
  return STYLE_CATEGORIES.has(value) ? value : null;
};

const normalizeVisibility = (visibility) => {
  const value = String(visibility || DEFAULT_VISIBILITY).trim();
  return STYLE_VISIBILITIES.has(value) ? value : null;
};

const mapStyle = (row) => ({
  id: row.id,
  name: row.name,
  prompt: row.prompt,
  description: row.description,
  tags: row.tags || [],
  previewUrl: row.preview_url,
  category: row.category || DEFAULT_CATEGORY,
  visibility: row.visibility || DEFAULT_VISIBILITY,
  authorName: row.author_name || null,
  createdAt: timestamp(row.created_at),
  updatedAt: timestamp(row.updated_at || row.created_at),
  publishedAt: timestamp(row.published_at),
  usageCount: Number(row.usage_count || 0),
  copyCount: Number(row.copy_count || 0),
  isCurated: Boolean(row.is_curated),
});

const selectStylesSql = `
  SELECT
    s.id,
    s.name,
    s.prompt,
    s.description,
    s.tags,
    s.preview_url,
    s.category,
    s.visibility,
    s.created_at,
    s.updated_at,
    s.published_at,
    s.usage_count,
    s.copy_count,
    s.is_curated,
    s.created_by,
    u.display_name AS author_name,
    u.email AS author_email
  FROM styles s
  LEFT JOIN users u ON u.id = s.created_by
`;

const getTargetId = (context, req) =>
  req.params?.id || context.bindingData?.id || req.query?.id;

const getAction = (context, req) =>
  req.params?.action || context.bindingData?.action || req.query?.action;

const getVisibleStyle = async ({ id, tenantId, userId }) =>
  query(
    `${selectStylesSql}
     WHERE s.id = $1
       AND s.tenant_id = $2
       AND (s.created_by = $3 OR s.visibility = 'shared')
     LIMIT 1`,
    [id, tenantId, userId]
  );

const handleListStyles = async (context, req, identity) => {
  const scope = ["mine", "shared", "all"].includes(req.query?.scope)
    ? req.query.scope
    : "mine";
  const category = req.query?.category ? normalizeCategory(req.query.category) : null;
  if (req.query?.category && !category) {
    context.res = error("不支援的風格分類", "bad_request", 400, req);
    return;
  }

  const sort = ["updated", "newest", "popular", "curated"].includes(req.query?.sort)
    ? req.query.sort
    : "updated";
  const params = [identity.tenantId];
  const where = ["s.tenant_id = $1"];

  if (scope === "mine") {
    params.push(identity.userId);
    where.push(`s.created_by = $${params.length}`);
  } else if (scope === "shared") {
    where.push("s.visibility = 'shared'");
  } else {
    params.push(identity.userId);
    where.push(`(s.created_by = $${params.length} OR s.visibility = 'shared')`);
  }

  if (category) {
    params.push(category);
    where.push(`s.category = $${params.length}`);
  }

  const q = String(req.query?.q || "").trim();
  if (q) {
    params.push(`%${q}%`);
    const qParam = `$${params.length}`;
    where.push(`(
      s.name ILIKE ${qParam}
      OR COALESCE(s.description, '') ILIKE ${qParam}
      OR COALESCE(u.display_name, '') ILIKE ${qParam}
      OR COALESCE(u.email, '') ILIKE ${qParam}
      OR s.category ILIKE ${qParam}
      OR EXISTS (
        SELECT 1 FROM unnest(COALESCE(s.tags, ARRAY[]::text[])) AS tag
        WHERE tag ILIKE ${qParam}
      )
    )`);
  }

  const tags = String(req.query?.tags || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  if (tags.length > 0) {
    params.push(tags);
    where.push(`s.tags && $${params.length}::text[]`);
  }

  const orderBy = {
    updated: "s.updated_at DESC NULLS LAST, s.created_at DESC",
    newest: "COALESCE(s.published_at, s.created_at) DESC",
    popular: "s.usage_count DESC, s.copy_count DESC, COALESCE(s.published_at, s.created_at) DESC",
    curated: "s.is_curated DESC, s.usage_count DESC, s.copy_count DESC, COALESCE(s.published_at, s.created_at) DESC",
  }[sort];

  const result = await query(
    `${selectStylesSql}
     WHERE ${where.join(" AND ")}
     ORDER BY ${orderBy}`,
    params
  );

  context.res = ok(result.rows.map(mapStyle), 200, req);
};

const handleCreateStyle = async (context, req, identity) => {
  const payload = req.body || {};
  const name = String(payload.name || "").trim();
  const prompt = String(payload.prompt || "").trim();
  const category = normalizeCategory(payload.category);
  const visibility = normalizeVisibility(payload.visibility);

  if (!name) {
    context.res = error("風格名稱為必填", "bad_request", 400, req);
    return;
  }
  if (!prompt) {
    context.res = error("風格 prompt 為必填", "bad_request", 400, req);
    return;
  }
  if (!category || !visibility) {
    context.res = error("風格分類或可見性不支援", "bad_request", 400, req);
    return;
  }

  const publishNow = visibility === "shared";
  const result = await query(
    `INSERT INTO styles (
       tenant_id,
       name,
       prompt,
       description,
       tags,
       preview_url,
       category,
       visibility,
       published_at,
       created_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, ${publishNow ? "now()" : "NULL"}, $9)
     RETURNING id`,
    [
      identity.tenantId,
      name,
      prompt,
      payload.description || null,
      normalizeTags(payload.tags),
      payload.previewUrl || null,
      category,
      visibility,
      identity.userId,
    ]
  );

  const created = await getVisibleStyle({
    id: result.rows[0].id,
    tenantId: identity.tenantId,
    userId: identity.userId,
  });

  context.res = ok(mapStyle(created.rows[0]), 201, req);
};

const handleUpdateStyle = async (context, req, identity, targetId) => {
  if (!targetId) {
    context.res = error("缺少 style id", "bad_request", 400, req);
    return;
  }

  const payload = req.body || {};
  const updates = [];
  const params = [];
  const addUpdate = (column, value) => {
    params.push(value);
    updates.push(`${column} = $${params.length}`);
  };

  if (Object.prototype.hasOwnProperty.call(payload, "name")) {
    const name = String(payload.name || "").trim();
    if (!name) {
      context.res = error("風格名稱為必填", "bad_request", 400, req);
      return;
    }
    addUpdate("name", name);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "prompt")) {
    const prompt = String(payload.prompt || "").trim();
    if (!prompt) {
      context.res = error("風格 prompt 為必填", "bad_request", 400, req);
      return;
    }
    addUpdate("prompt", prompt);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "description")) {
    addUpdate("description", payload.description || null);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "tags")) {
    addUpdate("tags", normalizeTags(payload.tags));
  }
  if (Object.prototype.hasOwnProperty.call(payload, "previewUrl")) {
    addUpdate("preview_url", payload.previewUrl || null);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "category")) {
    const category = normalizeCategory(payload.category);
    if (!category) {
      context.res = error("不支援的風格分類", "bad_request", 400, req);
      return;
    }
    addUpdate("category", category);
  }

  if (updates.length === 0) {
    context.res = error("沒有可更新的欄位", "bad_request", 400, req);
    return;
  }

  params.push(targetId, identity.tenantId, identity.userId);
  const result = await query(
    `UPDATE styles
     SET ${updates.join(", ")}, updated_at = now()
     WHERE id = $${params.length - 2}
       AND tenant_id = $${params.length - 1}
       AND created_by = $${params.length}
     RETURNING id`,
    params
  );

  if (result.rows.length === 0) {
    context.res = error("找不到 style 或無權限更新", "not_found", 404, req);
    return;
  }

  const updated = await getVisibleStyle({
    id: targetId,
    tenantId: identity.tenantId,
    userId: identity.userId,
  });
  context.res = ok(mapStyle(updated.rows[0]), 200, req);
};

const handleDeleteStyle = async (context, req, identity, targetId) => {
  if (!targetId) {
    context.res = error("缺少 style id", "bad_request", 400, req);
    return;
  }

  await query(
    "UPDATE history SET style_id = NULL WHERE style_id = $1 AND tenant_id = $2",
    [targetId, identity.tenantId]
  );

  const result = await query(
    "DELETE FROM styles WHERE id = $1 AND tenant_id = $2 AND created_by = $3 RETURNING id",
    [targetId, identity.tenantId, identity.userId]
  );
  if (result.rows.length === 0) {
    context.res = error("找不到 style 或無權限刪除", "not_found", 404, req);
    return;
  }
  context.res = ok(null, 204, req);
};

const handlePublishStyle = async (context, req, identity, targetId, publish) => {
  if (!targetId) {
    context.res = error("缺少 style id", "bad_request", 400, req);
    return;
  }

  const result = await query(
    `UPDATE styles
     SET visibility = $1,
         published_at = ${publish ? "COALESCE(published_at, now())" : "NULL"},
         updated_at = now()
     WHERE id = $2 AND tenant_id = $3 AND created_by = $4
     RETURNING id`,
    [publish ? "shared" : "private", targetId, identity.tenantId, identity.userId]
  );

  if (result.rows.length === 0) {
    context.res = error("找不到 style 或無權限變更共享狀態", "not_found", 404, req);
    return;
  }

  const updated = await getVisibleStyle({
    id: targetId,
    tenantId: identity.tenantId,
    userId: identity.userId,
  });
  context.res = ok(mapStyle(updated.rows[0]), 200, req);
};

const handleCopyStyle = async (context, req, identity, targetId) => {
  if (!targetId) {
    context.res = error("缺少 style id", "bad_request", 400, req);
    return;
  }

  const source = await query(
    `${selectStylesSql}
     WHERE s.id = $1 AND s.tenant_id = $2 AND s.visibility = 'shared'
     LIMIT 1`,
    [targetId, identity.tenantId]
  );

  if (source.rows.length === 0) {
    context.res = error("找不到可複製的共享風格", "not_found", 404, req);
    return;
  }

  const row = source.rows[0];
  const copied = await query(
    `INSERT INTO styles (
       tenant_id,
       name,
       prompt,
       description,
       tags,
       preview_url,
       category,
       visibility,
       created_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'private', $8)
     RETURNING id`,
    [
      identity.tenantId,
      row.created_by === identity.userId ? `${row.name} 副本` : row.name,
      row.prompt,
      row.description,
      row.tags || [],
      row.preview_url,
      row.category || DEFAULT_CATEGORY,
      identity.userId,
    ]
  );

  await query(
    "UPDATE styles SET copy_count = copy_count + 1, updated_at = now() WHERE id = $1 AND tenant_id = $2",
    [targetId, identity.tenantId]
  );

  const copiedStyle = await getVisibleStyle({
    id: copied.rows[0].id,
    tenantId: identity.tenantId,
    userId: identity.userId,
  });
  context.res = ok(mapStyle(copiedStyle.rows[0]), 201, req);
};

const handleUseStyle = async (context, req, identity, targetId) => {
  if (!targetId) {
    context.res = error("缺少 style id", "bad_request", 400, req);
    return;
  }

  const result = await query(
    `UPDATE styles
     SET usage_count = usage_count + 1, updated_at = now()
     WHERE id = $1
       AND tenant_id = $2
       AND (created_by = $3 OR visibility = 'shared')
     RETURNING id`,
    [targetId, identity.tenantId, identity.userId]
  );

  if (result.rows.length === 0) {
    context.res = error("找不到可使用的風格", "not_found", 404, req);
    return;
  }

  const updated = await getVisibleStyle({
    id: targetId,
    tenantId: identity.tenantId,
    userId: identity.userId,
  });
  context.res = ok(mapStyle(updated.rows[0]), 200, req);
};

module.exports = async function (context, req) {
  if ((req.method || "").toUpperCase() === "OPTIONS") {
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

  const identity = await resolveIdentity(auth.user);
  if (!identity.userId) {
    context.res = error("無法辨識使用者", "unauthorized", 401, req);
    return;
  }

  const method = (req.method || "GET").toUpperCase();
  const targetId = getTargetId(context, req);
  const action = getAction(context, req);

  if (method === "GET") {
    await handleListStyles(context, req, identity);
    return;
  }

  if (method === "POST" && !targetId) {
    await handleCreateStyle(context, req, identity);
    return;
  }

  if (method === "PUT") {
    await handleUpdateStyle(context, req, identity, targetId);
    return;
  }

  if (method === "DELETE") {
    await handleDeleteStyle(context, req, identity, targetId);
    return;
  }

  if (method === "POST" && action === "publish") {
    await handlePublishStyle(context, req, identity, targetId, true);
    return;
  }

  if (method === "POST" && action === "unpublish") {
    await handlePublishStyle(context, req, identity, targetId, false);
    return;
  }

  if (method === "POST" && action === "copy") {
    await handleCopyStyle(context, req, identity, targetId);
    return;
  }

  if (method === "POST" && action === "use") {
    await handleUseStyle(context, req, identity, targetId);
    return;
  }

  context.res = error("Method not allowed", "method_not_allowed", 405, req);
};
