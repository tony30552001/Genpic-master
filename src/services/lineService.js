/**
 * lineService.js
 *
 * Unified LINE integration service:
 * - LINE Config management API calls (Track A setup)
 * - Image sending via Bot Push
 */

import { apiGet, apiPost, apiDelete } from "./apiClient";
import { API_BASE_URL } from "../config";

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


// ─── Direct Send ───────────────────────────────────────────────────────────

/**
 * Send an image to LINE using the bound Official Account (Push API).
 *
 * @param {string} imageUrl - The image URL to send
 * @param {string} [message] - Optional text message
 * @returns {Promise<{ success: boolean }>}
 */
export const sendImageToLine = async (imageUrl, message) => {
    try {
        const result = await apiPost(`${API_BASE_URL}/send-line-image`, {
            imageUrl,
            message,
        });
        return { success: true, ...result };
    } catch (err) {
        console.error("Backend LINE API failed:", err);
        throw err;
    }
};
