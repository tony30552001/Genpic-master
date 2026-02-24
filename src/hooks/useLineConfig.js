/**
 * useLineConfig.js
 *
 * React hook for managing the user's LINE Official Account binding.
 *
 * Provides:
 * - config          — current LINE config (null if not bound)
 * - isBound         — boolean: user has an active LINE config
 * - isLoading       — loading state
 * - isSaving        — saving/verifying state
 * - loadConfig()    — manually refresh
 * - saveConfig()    — create or update binding
 * - deleteConfig()  — remove binding
 * - verifyToken()   — pre-validate a token before saving
 */

import { useCallback, useEffect, useState } from "react";
import {
    getLineConfig,
    removeLineConfig,
    saveLineConfig,
    verifyLineToken,
} from "../services/lineService";

export default function useLineConfig({ user }) {
    const [config, setConfig] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState(null);

    // Derived: whether user has an active binding
    const isBound = !!(config && config.isActive);

    const loadConfig = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        setError(null);
        try {
            const data = await getLineConfig();
            setConfig(data); // null = not bound
        } catch (err) {
            console.error("[useLineConfig] load error:", err);
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, [user]);

    // Load on mount / user change
    useEffect(() => {
        if (!user) {
            setConfig(null);
            return;
        }
        loadConfig();
    }, [user, loadConfig]);

    /**
     * Save (create/update) the LINE Official Account binding.
     * @param {object} formData
     * @param {string} formData.channelAccessToken
     * @param {string} [formData.channelSecret]
     * @param {string} [formData.channelName]
     * @param {string} [formData.targetId]
     * @param {string} [formData.targetType]
     */
    const saveConfig = useCallback(
        async (formData) => {
            if (!user) throw new Error("未登入");
            setIsSaving(true);
            setError(null);
            try {
                const updated = await saveLineConfig(formData);
                setConfig(updated);
                return updated;
            } catch (err) {
                setError(err.message);
                throw err;
            } finally {
                setIsSaving(false);
            }
        },
        [user]
    );

    /**
     * Remove the LINE binding.
     */
    const deleteConfig = useCallback(async () => {
        if (!user) throw new Error("未登入");
        setIsSaving(true);
        setError(null);
        try {
            await removeLineConfig();
            setConfig(null);
        } catch (err) {
            setError(err.message);
            throw err;
        } finally {
            setIsSaving(false);
        }
    }, [user]);

    /**
     * Verify a Channel Access Token via backend.
     * @param {string} token
     * @returns {Promise<{ valid: boolean, channelName?: string, message?: string }>}
     */
    const verifyToken = useCallback(async (token) => {
        return verifyLineToken(token);
    }, []);

    return {
        config,
        isBound,
        isLoading,
        isSaving,
        error,
        loadConfig,
        saveConfig,
        deleteConfig,
        verifyToken,
    };
}
