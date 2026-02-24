/**
 * lineService.js
 *
 * Unified LINE integration service:
 * - LIFF SDK initialization & shareTargetPicker (Track B)
 * - LINE Config management API calls (Track A setup)
 * - Image sending with dual-track routing
 */

import { apiGet, apiPost, apiDelete } from "./apiClient";
import { API_BASE_URL } from "../config";

// ─── LIFF SDK ─────────────────────────────────────────────────────────────

/** LIFF App ID — set via VITE_LIFF_ID env var or hardcode after creation */
const LIFF_ID = import.meta.env.VITE_LIFF_ID || "";

let liffInitialized = false;
let liffInitializing = false;
let liffSdk = null;

/**
 * Lazily load and initialize the LIFF SDK.
 * Safe to call multiple times; resolves immediately if already initialized.
 */
export const initLiff = async () => {
    if (liffInitialized) return liffSdk;
    if (liffInitializing) {
        // Wait until ongoing initialization completes
        await new Promise((resolve) => {
            const check = setInterval(() => {
                if (!liffInitializing) { clearInterval(check); resolve(); }
            }, 50);
        });
        return liffSdk;
    }

    if (!LIFF_ID) {
        throw new Error(
            "LIFF_ID 未設定。請在 .env 中加入 VITE_LIFF_ID=<your-liff-id>"
        );
    }

    liffInitializing = true;
    try {
        // Dynamic import to avoid bundling LIFF SDK into main chunk unnecessarily
        const { default: liff } = await import("@line/liff");
        await liff.init({ liffId: LIFF_ID });
        liffSdk = liff;
        liffInitialized = true;
        return liff;
    } finally {
        liffInitializing = false;
    }
};

/**
 * Open the LINE Share Target Picker (Track B).
 * User selects a friend or group — the message is sent from their personal LINE account.
 *
 * @param {string} imageUrl  - Publicly accessible image URL
 * @param {string} [altText] - Optional text message before the image
 */
export const shareViaLiff = async (imageUrl, altText) => {
    const liff = await initLiff();

    if (!liff.isApiAvailable("shareTargetPicker")) {
        // Fallback for non-LIFF environment (e.g. desktop browser)
        // Note: LINE web share only officially supports sending text/links natively smoothly.
        // We will append the URL to the text message to share it.
        const shareText = altText ? `${altText}\n${imageUrl}` : imageUrl;
        const lineShareUrl = `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(imageUrl)}&text=${encodeURIComponent(shareText)}`;
        window.open(lineShareUrl, "_blank");
        return true;
    }

    const messages = [];
    if (altText) {
        messages.push({ type: "text", text: altText });
    }
    messages.push({
        type: "image",
        originalContentUrl: imageUrl,
        previewImageUrl: imageUrl,
    });

    const result = await liff.shareTargetPicker(messages);
    // result is undefined if user cancels, or { status: "success" }
    return result?.status === "success";
};

// ─── LINE Config API ───────────────────────────────────────────────────────

/** Fetch current user's LINE Official Account config */
export const getLineConfig = () =>
    apiGet(`${API_BASE_URL}/line-config`);

/**
 * Save / update LINE Official Account binding.
 * @param {object} config
 * @param {string} config.channelAccessToken  - Required
 * @param {string} [config.channelSecret]
 * @param {string} [config.channelName]
 * @param {string} [config.targetId]          - Target group/user ID
 * @param {string} [config.targetType]        - "group" | "user"
 */
export const saveLineConfig = (config) =>
    apiPost(`${API_BASE_URL}/line-config`, config);

/** Remove LINE Official Account binding */
export const removeLineConfig = () =>
    apiDelete(`${API_BASE_URL}/line-config`);

/**
 * Verify a Channel Access Token before saving.
 * Returns { valid: boolean, channelName?: string, message?: string }
 */
export const verifyLineToken = (channelAccessToken) =>
    apiPost(`${API_BASE_URL}/line-config?action=verify`, { channelAccessToken });

// ─── Dual-track Send ───────────────────────────────────────────────────────

/**
 * Send an image to LINE using the optimal track.
 *
 * 1. Calls backend /api/send-line-image
 * 2. If backend says { track: "liff" } → opens LIFF shareTargetPicker
 * 3. If backend says { track: "bot" }  → image was already sent
 *
 * @param {string} imageUrl - The image URL to send
 * @param {string} [message] - Optional text message
 * @returns {Promise<{ track: "bot"|"liff", success: boolean }>}
 */
export const sendImageToLine = async (imageUrl, message) => {
    try {
        const result = await apiPost(`${API_BASE_URL}/send-line-image`, {
            imageUrl,
            message,
        });

        if (result.track === "liff") {
            // Track B: open LIFF picker
            const sent = await shareViaLiff(imageUrl, message);
            return { track: "liff", success: !!sent };
        }

        // Track A: bot already pushed
        return { track: "bot", success: result.success };
    } catch (err) {
        console.warn("Backend LINE API failed, falling back to LIFF:", err);
        // Fallback to Track B if backend is unreachable or user not authenticated
        const sent = await shareViaLiff(imageUrl, message);
        return { track: "liff", success: !!sent };
    }
};
