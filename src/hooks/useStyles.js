import { useCallback, useEffect, useRef, useState } from "react";

import {
  addStyle,
  copyStyle as copyStyleApi,
  deleteStyle,
  listStyles,
  markStyleUsed as markStyleUsedApi,
  publishStyle as publishStyleApi,
  unpublishStyle as unpublishStyleApi,
  updateStyle as updateStyleApi,
} from "../services/storageService";

const DEFAULT_STYLE_CATEGORY = "general";
const DEFAULT_SCOPE = "mine";
const DEFAULT_SORT = "updated";
const SEARCH_DEBOUNCE_MS = 300;

const compressImage = (dataUrl) =>
  new Promise((resolve, reject) => {
    if (!dataUrl || !dataUrl.startsWith("data:image")) return resolve(dataUrl);

    const img = new Image();
    img.src = dataUrl;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      const maxWidth = 800;
      let { width, height } = img;

      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      resolve(canvas.toDataURL("image/jpeg", 0.6));
    };
    img.onerror = (err) => reject(err);
  });

const parseTags = (value) =>
  String(value || "")
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean);

export default function useStyles({ user }) {
  const [savedStyles, setSavedStyles] = useState([]);
  const [newStyleName, setNewStyleName] = useState("");
  const [newStyleTags, setNewStyleTags] = useState("");
  const [newStyleCategory, setNewStyleCategory] = useState(DEFAULT_STYLE_CATEGORY);
  const [scope, setScope] = useState(DEFAULT_SCOPE);
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [isLoadingStyles, setIsLoadingStyles] = useState(false);
  const [isSavingStyle, setIsSavingStyle] = useState(false);
  const [styleError, setStyleError] = useState("");
  const loadSeqRef = useRef(0);
  const searchTimerRef = useRef(null);
  const isSearching = searchQuery.trim() !== debouncedSearchQuery;

  useEffect(() => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }

    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim());
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, [searchQuery]);

  const refreshStyles = useCallback(async (overrides = {}) => {
    if (!user) {
      setSavedStyles([]);
      return [];
    }

    const params = {
      scope,
      sort,
      q: debouncedSearchQuery,
      ...overrides,
    };
    const seq = loadSeqRef.current + 1;
    loadSeqRef.current = seq;
    setIsLoadingStyles(true);
    setStyleError("");

    try {
      const styles = await listStyles(params);
      if (loadSeqRef.current === seq) {
        setSavedStyles(styles || []);
      }
      return styles || [];
    } catch (err) {
      if (loadSeqRef.current === seq) {
        setStyleError(err.message || "風格載入失敗");
      }
      throw err;
    } finally {
      if (loadSeqRef.current === seq) {
        setIsLoadingStyles(false);
      }
    }
  }, [user, scope, sort, debouncedSearchQuery]);

  useEffect(() => {
    if (!user) return undefined;

    let cancelled = false;
    (async () => {
      try {
        await refreshStyles();
      } catch {
        if (!cancelled) {
          setSavedStyles([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, refreshStyles]);

  const saveStyle = useCallback(
    async ({ analyzedStyle, analysisResultData, referencePreview }) => {
      if (!user || !analyzedStyle) return null;
      if (!newStyleName.trim()) {
        throw new Error("請輸入風格名稱");
      }

      setIsSavingStyle(true);
      try {
        const compressedPreview = await compressImage(referencePreview);
        const saved = await addStyle({
          name: newStyleName.trim(),
          tags: parseTags(newStyleTags),
          prompt: analyzedStyle,
          description: analysisResultData?.style_description_zh || "",
          previewUrl: compressedPreview || "",
          category: newStyleCategory,
        });

        await refreshStyles({ scope: DEFAULT_SCOPE, q: "" });
        setNewStyleName("");
        setNewStyleTags("");
        setNewStyleCategory(DEFAULT_STYLE_CATEGORY);
        return saved;
      } finally {
        setIsSavingStyle(false);
      }
    },
    [user, newStyleName, newStyleTags, newStyleCategory, refreshStyles]
  );

  const removeStyle = useCallback(
    async (styleId) => {
      if (!user) return;
      await deleteStyle(styleId);
      await refreshStyles();
    },
    [user, refreshStyles]
  );

  const removeStyles = useCallback(
    async (styleIds) => {
      if (!user || !styleIds || styleIds.length === 0) return;
      await Promise.all(styleIds.map((id) => deleteStyle(id)));
      await refreshStyles();
    },
    [user, refreshStyles]
  );

  const updateStyle = useCallback(
    async (styleId, data) => {
      if (!user) return null;
      const updated = await updateStyleApi(styleId, data);
      await refreshStyles();
      return updated;
    },
    [user, refreshStyles]
  );

  const publishStyle = useCallback(
    async (styleId) => {
      if (!user) return null;
      const updated = await publishStyleApi(styleId);
      await refreshStyles();
      return updated;
    },
    [user, refreshStyles]
  );

  const unpublishStyle = useCallback(
    async (styleId) => {
      if (!user) return null;
      const updated = await unpublishStyleApi(styleId);
      await refreshStyles();
      return updated;
    },
    [user, refreshStyles]
  );

  const copyStyle = useCallback(
    async (styleId) => {
      if (!user) return null;
      const copied = await copyStyleApi(styleId);
      await refreshStyles();
      return copied;
    },
    [user, refreshStyles]
  );

  const markStyleUsed = useCallback(
    async (styleId) => {
      if (!user || !styleId) return null;
      return markStyleUsedApi(styleId);
    },
    [user]
  );

  const searchStyles = useCallback((query) => {
    setSearchQuery(query || "");
  }, []);

  return {
    savedStyles: user ? savedStyles : [],
    newStyleName,
    newStyleTags,
    newStyleCategory,
    scope,
    sort,
    searchQuery,
    isLoadingStyles,
    isSavingStyle,
    isSearching,
    styleError,
    setNewStyleName,
    setNewStyleTags,
    setNewStyleCategory,
    setScope,
    setSort,
    setSearchQuery,
    refreshStyles,
    saveStyle,
    deleteStyle: removeStyle,
    deleteStyles: removeStyles,
    updateStyle,
    publishStyle,
    unpublishStyle,
    copyStyle,
    markStyleUsed,
    searchStyles,
  };
}
