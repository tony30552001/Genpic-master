import { useCallback, useEffect, useState } from "react";

import {
    addTemplate,
    deleteTemplate,
    listTemplates,
    updateTemplate as updateTemplateApi,
} from "../services/storageService";

export default function useTemplates({ user }) {
    const [templates, setTemplates] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    // 登入後自動載入
    useEffect(() => {
        if (!user) return undefined;
        let cancelled = false;

        const load = async () => {
            setIsLoading(true);
            try {
                const items = await listTemplates();
                if (!cancelled) setTemplates(items || []);
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };

        load();
        return () => {
            cancelled = true;
        };
    }, [user]);

    const saveTemplate = useCallback(
        async (data) => {
            if (!user) return;
            if (!data.name || !data.name.trim()) {
                throw new Error("請輸入範本名稱");
            }

            await addTemplate(data);
            const items = await listTemplates();
            setTemplates(items || []);
        },
        [user]
    );

    const updateTemplate = useCallback(
        async (id, data) => {
            if (!user) return;
            await updateTemplateApi(id, data);
            const items = await listTemplates();
            setTemplates(items || []);
        },
        [user]
    );

    const removeTemplate = useCallback(
        async (templateId) => {
            if (!user) return;
            await deleteTemplate(templateId);
            const items = await listTemplates();
            setTemplates(items || []);
        },
        [user]
    );

    const removeTemplates = useCallback(
        async (templateIds) => {
            if (!user || !templateIds || templateIds.length === 0) return;
            await Promise.all(templateIds.map((id) => deleteTemplate(id)));
            const items = await listTemplates();
            setTemplates(items || []);
        },
        [user]
    );

    return {
        templates,
        isLoading,
        saveTemplate,
        updateTemplate,
        removeTemplate,
        removeTemplates,
    };
}
