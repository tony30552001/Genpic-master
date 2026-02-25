/**
 * api/send-line-image/index.js
 *
 * Dual-track LINE image sending endpoint.
 *
 * POST /api/send-line-image
 * Body: { imageUrl: string, message?: string }
 *
 * Track A: User has a bound LINE Official Account → push via Messaging API
 * Track B: No binding → return { track: "liff" } so frontend opens LIFF shareTargetPicker
 */

const { ok, error, options } = require("../_shared/http");
const { requireAuth } = require("../_shared/auth");
const { rateLimit } = require("../_shared/rateLimit");
const { query } = require("../_shared/db");
const { resolveIdentity } = require("../_shared/identity");
const { decrypt } = require("../_shared/lineEncryption");

// ─── Push image via LINE Messaging API ────────────────────────────────────
const pushImageMessage = async (channelAccessToken, targetId, imageUrl, altText) => {
    const payload = {
        to: targetId,
        messages: [
            {
                type: "image",
                originalContentUrl: imageUrl,
                previewImageUrl: imageUrl,
            },
        ],
    };

    // Optionally prepend a text message
    if (altText) {
        payload.messages.unshift({ type: "text", text: altText });
    }

    const resp = await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${channelAccessToken}`,
        },
        body: JSON.stringify(payload),
    });

    if (!resp.ok) {
        const body = await resp.text();
        throw new Error(`LINE Messaging API 錯誤 ${resp.status}: ${body}`);
    }
    return true;
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

    if ((req.method || "").toUpperCase() !== "POST") {
        context.res = error("Method not allowed", "method_not_allowed", 405);
        return;
    }

    const { imageUrl, message } = req.body || {};
    if (!imageUrl) {
        context.res = error("缺少 imageUrl", "bad_request", 400);
        return;
    }

    const identity = await resolveIdentity(auth.user);
    if (!identity.userId) {
        context.res = error("無法辨識使用者", "unauthorized", 401);
        return;
    }

    // ── Look up user's LINE config ─────────────────────────────────────────
    const configResult = await query(
        `SELECT channel_access_token_enc, target_id, target_type, is_active
     FROM line_configs
     WHERE user_id = $1 AND tenant_id = $2
     LIMIT 1`,
        [identity.userId, identity.tenantId]
    );

    // No binding
    if (configResult.rows.length === 0) {
        context.res = error("未綁定 LINE 官方帳號設定", "line_config_not_found", 400);
        return;
    }

    const config = configResult.rows[0];

    // Binding exists but is disabled
    if (!config.is_active) {
        context.res = error("LINE 官方帳號設定尚未啟用", "line_config_disabled", 400);
        return;
    }

    // No target configured
    if (!config.target_id) {
        context.res = error("LINE 官方帳號發送目標尚未設定", "no_target_configured", 400);
        return;
    }

    // Track A: Push via user's Official Account
    try {
        const token = decrypt(config.channel_access_token_enc);
        await pushImageMessage(token, config.target_id, imageUrl, message || null);
        context.res = ok({ track: "bot", success: true });
    } catch (err) {
        console.error("[send-line-image] Error:", err.message);
        context.res = error(`發送失敗: ${err.message}`, "send_failed", 502);
    }
};
