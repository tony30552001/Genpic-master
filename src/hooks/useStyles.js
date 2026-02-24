import { useCallback, useEffect, useRef, useState } from "react";

import { addStyle, deleteStyle, listStyles } from "../services/storageService";

const compressImage = (dataUrl) =>
  new Promise((resolve, reject) => {
    if (!dataUrl || !dataUrl.startsWith("data:image")) return resolve(dataUrl);

    const img = new Image();
    img.src = dataUrl;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      const maxWidth = 800; // 前端壓縮到最多 800 寬
      let { width, height } = img;

      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      // 設定輸出格式和品質 (JPEG, 0.6)
      const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.6);
      resolve(compressedDataUrl);
    };
    img.onerror = (err) => reject(err);
  });

export default function useStyles({ user }) {
  const [savedStyles, setSavedStyles] = useState([]);
  const [newStyleName, setNewStyleName] = useState("");
  const [newStyleTags, setNewStyleTags] = useState("");
  const [isSavingStyle, setIsSavingStyle] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimerRef = useRef(null);
  const searchSeqRef = useRef(0);

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;

    const load = async () => {
      const styles = await listStyles();
      if (!cancelled) setSavedStyles(styles || []);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const saveStyle = useCallback(
    async ({ analyzedStyle, analysisResultData, referencePreview }) => {
      if (!user || !analyzedStyle) return;
      if (!newStyleName.trim()) {
        throw new Error("請輸入風格名稱");
      }

      setIsSavingStyle(true);
      try {
        const compressedPreview = await compressImage(referencePreview);

        await addStyle({
          name: newStyleName,
          tags: newStyleTags
            .split(/[,，]/)
            .map((tag) => tag.trim())
            .filter(Boolean),
          prompt: analyzedStyle,
          description: analysisResultData?.style_description_zh || "",
          previewUrl: compressedPreview || "",
        });

        const styles = await listStyles();
        setSavedStyles(styles || []);
        setNewStyleName("");
        setNewStyleTags("");
      } finally {
        setIsSavingStyle(false);
      }
    },
    [user, newStyleName, newStyleTags]
  );

  const removeStyle = useCallback(
    async (styleId) => {
      if (!user) return;
      await deleteStyle(styleId);
      const styles = await listStyles();
      setSavedStyles(styles || []);
    },
    [user]
  );

  const removeStyles = useCallback(
    async (styleIds) => {
      if (!user || !styleIds || styleIds.length === 0) return;
      // 這裡暫時使用 Promise.all 併發刪除，若量大再改為後端批次處理
      await Promise.all(styleIds.map((id) => deleteStyle(id)));
      const styles = await listStyles();
      setSavedStyles(styles || []);
    },
    [user]
  );

  const searchStyles = useCallback(
    (query) => {
      if (!user) return;
      const trimmed = (query || "").trim();

      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }

      if (!trimmed) {
        const seq = searchSeqRef.current + 1;
        searchSeqRef.current = seq;
        setIsSearching(false);
        (async () => {
          const styles = await listStyles();
          if (searchSeqRef.current === seq) {
            setSavedStyles(styles || []);
          }
        })();
        return;
      }

      setIsSearching(true);

      searchTimerRef.current = setTimeout(async () => {
        const seq = searchSeqRef.current + 1;
        searchSeqRef.current = seq;

        try {
          // 不再使用 embedding 搜尋，改為客戶端直接過濾或先全撈
          const styles = await listStyles();
          if (searchSeqRef.current === seq) {
            // 在前端對全拿回來的 styles 做簡單關鍵字過濾
            const filtered = (styles || []).filter((s) => {
              const textToSearch = [
                s.name,
                s.description,
                ...(s.tags || []),
              ].join(" ").toLowerCase();
              return textToSearch.includes(trimmed.toLowerCase());
            });
            setSavedStyles(filtered);
            setIsSearching(false);
          }
        } catch {
          const styles = await listStyles();
          if (searchSeqRef.current === seq) {
            setSavedStyles(styles || []);
            setIsSearching(false);
          }
        }
      }, 300);
    },
    [user]
  );

  useEffect(() => () => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }
  }, []);

  return {
    savedStyles,
    newStyleName,
    newStyleTags,
    isSavingStyle,
    isSearching,
    setNewStyleName,
    setNewStyleTags,
    saveStyle,
    deleteStyle: removeStyle,
    deleteStyles: removeStyles,
    searchStyles,
  };
}
