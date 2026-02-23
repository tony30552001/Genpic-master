const { ok, error, options } = require("../_shared/http");
const { requireAuth } = require("../_shared/auth");
const { rateLimit } = require("../_shared/rateLimit");
const { query } = require("../_shared/db");
const { resolveIdentity } = require("../_shared/identity");

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

    const method = (req.method || "GET").toUpperCase();
    const id = req.params?.id;
    const identity = await resolveIdentity(auth.user);
    if (!identity.userId) {
        context.res = error("無法辨識使用者", "unauthorized", 401);
        return;
    }

    // ── GET: List templates ──
    if (method === "GET") {
        const category = req.query?.category;
        let sql =
            "SELECT id, name, description, user_script, style_prompt, style_id, tags, preview_url, category, created_at, updated_at FROM templates WHERE tenant_id = $1 AND created_by = $2";
        const params = [identity.tenantId, identity.userId];

        if (category) {
            sql += " AND category = $3";
            params.push(category);
        }

        sql += " ORDER BY updated_at DESC";

        const result = await query(sql, params);
        const items = result.rows.map((row) => ({
            id: row.id,
            name: row.name,
            description: row.description,
            userScript: row.user_script,
            stylePrompt: row.style_prompt,
            styleId: row.style_id,
            tags: row.tags || [],
            previewUrl: row.preview_url,
            category: row.category,
            createdAt: {
                seconds: Math.floor(new Date(row.created_at).getTime() / 1000),
            },
            updatedAt: {
                seconds: Math.floor(new Date(row.updated_at).getTime() / 1000),
            },
        }));
        context.res = ok(items);
        return;
    }

    // ── POST: Create template ──
    if (method === "POST") {
        const payload = req.body || {};
        if (!payload.name || !payload.name.trim()) {
            context.res = error("範本名稱為必填", "bad_request", 400);
            return;
        }

        const result = await query(
            `INSERT INTO templates (tenant_id, name, description, user_script, style_prompt, style_id, tags, preview_url, category, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, name, description, user_script, style_prompt, style_id, tags, preview_url, category, created_at, updated_at`,
            [
                identity.tenantId,
                payload.name.trim(),
                payload.description || null,
                payload.userScript || null,
                payload.stylePrompt || null,
                payload.styleId || null,
                payload.tags || [],
                payload.previewUrl || null,
                payload.category || "general",
                identity.userId,
            ]
        );

        const row = result.rows[0];
        context.res = ok(
            {
                id: row.id,
                name: row.name,
                description: row.description,
                userScript: row.user_script,
                stylePrompt: row.style_prompt,
                styleId: row.style_id,
                tags: row.tags || [],
                previewUrl: row.preview_url,
                category: row.category,
                createdAt: {
                    seconds: Math.floor(new Date(row.created_at).getTime() / 1000),
                },
                updatedAt: {
                    seconds: Math.floor(new Date(row.updated_at).getTime() / 1000),
                },
            },
            201
        );
        return;
    }

    // ── PUT: Update template ──
    if (method === "PUT") {
        const targetId = id || context.bindingData?.id || req.query?.id;
        if (!targetId) {
            context.res = error("缺少 template id", "bad_request", 400);
            return;
        }

        const payload = req.body || {};
        if (!payload.name || !payload.name.trim()) {
            context.res = error("範本名稱為必填", "bad_request", 400);
            return;
        }

        const result = await query(
            `UPDATE templates
       SET name = $1, description = $2, user_script = $3, style_prompt = $4,
           style_id = $5, tags = $6, preview_url = $7, category = $8, updated_at = now()
       WHERE id = $9 AND tenant_id = $10 AND created_by = $11
       RETURNING id, name, description, user_script, style_prompt, style_id, tags, preview_url, category, created_at, updated_at`,
            [
                payload.name.trim(),
                payload.description || null,
                payload.userScript || null,
                payload.stylePrompt || null,
                payload.styleId || null,
                payload.tags || [],
                payload.previewUrl || null,
                payload.category || "general",
                targetId,
                identity.tenantId,
                identity.userId,
            ]
        );

        if (result.rows.length === 0) {
            context.res = error(
                "找不到範本或無權限更新",
                "not_found",
                404
            );
            return;
        }

        const row = result.rows[0];
        context.res = ok({
            id: row.id,
            name: row.name,
            description: row.description,
            userScript: row.user_script,
            stylePrompt: row.style_prompt,
            styleId: row.style_id,
            tags: row.tags || [],
            previewUrl: row.preview_url,
            category: row.category,
            createdAt: {
                seconds: Math.floor(new Date(row.created_at).getTime() / 1000),
            },
            updatedAt: {
                seconds: Math.floor(new Date(row.updated_at).getTime() / 1000),
            },
        });
        return;
    }

    // ── DELETE: Delete template ──
    if (method === "DELETE") {
        const targetId = id || context.bindingData?.id || req.query?.id;
        if (!targetId) {
            context.res = error("缺少 template id", "bad_request", 400);
            return;
        }

        const result = await query(
            "DELETE FROM templates WHERE id = $1 AND tenant_id = $2 AND created_by = $3 RETURNING id",
            [targetId, identity.tenantId, identity.userId]
        );

        if (result.rows.length === 0) {
            context.res = error(
                "找不到範本或無權限刪除",
                "not_found",
                404
            );
            return;
        }

        context.res = ok(null, 204);
        return;
    }

    context.res = error("Method not allowed", "method_not_allowed", 405);
};
