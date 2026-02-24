/**
 * api/line-config/index.js
 *
 * CRUD API for managing user's LINE Official Account binding.
 *
 * GET    /api/line-config         — Get current user's LINE config
 * POST   /api/line-config         — Create / update LINE config
 * DELETE /api/line-config         — Remove LINE config
 * POST   /api/line-config/verify  — Verify token validity (via LINE Messaging API)
 */

const { ok, error, options } = require("../_shared/http");
const { requireAuth } = require("../_shared/auth");
const { rateLimit } = require("../_shared/rateLimit");
const { query } = require("../_shared/db");
const { resolveIdentity } = require("../_shared/identity");
const { encrypt } = require("../_shared/lineEncryption");

// ─── Verify Line Token by calling Messaging API ────────────────────────────
const verifyLineToken = async (channelAccessToken) => {
    const resp = await fetch("https://api.line.me/v2/bot/info", {
        headers: { Authorization: `Bearer ${channelAccessToken}` },
    });
    if (!resp.ok) {
        const body = await resp.text();
        throw new Error(`LINE API 回應 ${resp.status}: ${body}`);
    }
    return resp.json(); // { displayName, pictureUrl, ... }
};

// ─── Main handler ──────────────────────────────────────────────────────────
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

    const identity = await resolveIdentity(auth.user);
    if (!identity.userId) {
        context.res = error("無法辨識使用者", "unauthorized", 401);
        return;
    }

    const method = (req.method || "GET").toUpperCase();
    const action = req.query?.action; // e.g. ?action=verify

    // ── POST /api/line-config?action=verify ─────────────────────────────────
    if (method === "POST" && action === "verify") {
        const { channelAccessToken } = req.body || {};
        if (!channelAccessToken) {
            context.res = error("缺少 channelAccessToken", "bad_request", 400);
            return;
        }
        try {
            const botInfo = await verifyLineToken(channelAccessToken);
            context.res = ok({
                valid: true,
                channelName: botInfo.displayName,
                pictureUrl: botInfo.pictureUrl,
            });
        } catch (err) {
            context.res = ok({ valid: false, message: err.message });
        }
        return;
    }

    // ── GET /api/line-config ─────────────────────────────────────────────────
    if (method === "GET") {
        const result = await query(
            `SELECT id, channel_name, target_id, target_type, is_active, created_at, updated_at
       FROM line_configs
       WHERE user_id = $1 AND tenant_id = $2
       LIMIT 1`,
            [identity.userId, identity.tenantId]
        );

        if (result.rows.length === 0) {
            context.res = ok(null);
            return;
        }

        const row = result.rows[0];
        context.res = ok({
            id: row.id,
            channelName: row.channel_name,
            targetId: row.target_id,
            targetType: row.target_type,
            isActive: row.is_active,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        });
        return;
    }

    // ── POST /api/line-config  (create or update) ────────────────────────────
    if (method === "POST") {
        const {
            channelAccessToken,
            channelSecret,
            channelName,
            targetId,
            targetType,
        } = req.body || {};

        if (!channelAccessToken) {
            context.res = error("缺少 channelAccessToken", "bad_request", 400);
            return;
        }

        // Encrypt sensitive fields
        const tokenEnc = encrypt(channelAccessToken);
        const secretEnc = channelSecret ? encrypt(channelSecret) : null;

        // Upsert (ON CONFLICT DO UPDATE)
        const result = await query(
            `INSERT INTO line_configs
         (user_id, tenant_id, channel_name, channel_access_token_enc, channel_secret_enc, target_id, target_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, tenant_id)
       DO UPDATE SET
         channel_name              = EXCLUDED.channel_name,
         channel_access_token_enc  = EXCLUDED.channel_access_token_enc,
         channel_secret_enc        = EXCLUDED.channel_secret_enc,
         target_id                 = EXCLUDED.target_id,
         target_type               = EXCLUDED.target_type,
         is_active                 = true,
         updated_at                = now()
       RETURNING id, channel_name, target_id, target_type, is_active, created_at, updated_at`,
            [
                identity.userId,
                identity.tenantId,
                channelName || null,
                tokenEnc,
                secretEnc,
                targetId || null,
                targetType || "group",
            ]
        );

        const row = result.rows[0];
        context.res = ok(
            {
                id: row.id,
                channelName: row.channel_name,
                targetId: row.target_id,
                targetType: row.target_type,
                isActive: row.is_active,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            },
            201
        );
        return;
    }

    // ── DELETE /api/line-config ──────────────────────────────────────────────
    if (method === "DELETE") {
        const result = await query(
            "DELETE FROM line_configs WHERE user_id = $1 AND tenant_id = $2 RETURNING id",
            [identity.userId, identity.tenantId]
        );

        if (result.rows.length === 0) {
            context.res = error("找不到設定或無權限", "not_found", 404);
            return;
        }

        context.res = ok(null, 204);
        return;
    }

    context.res = error("Method not allowed", "method_not_allowed", 405);
};
