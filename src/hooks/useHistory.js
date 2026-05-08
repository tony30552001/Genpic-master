import { useCallback, useEffect, useState } from "react";

import {
  addHistoryItem,
  deleteHistoryItem as removeHistoryItem,
  listHistory,
} from "../services/storageService";

const compressImage = (dataUrl) =>
  new Promise((resolve, reject) => {
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

      const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.6);
      resolve(compressedDataUrl);
    };
    img.onerror = (err) => reject(err);
  });

export default function useHistory({ user }) {
  const [historyItems, setHistoryItems] = useState([]);

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;

    const load = async () => {
      const items = await listHistory();
      if (!cancelled) setHistoryItems(items || []);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const saveHistoryItem = useCallback(
    async ({ imageUrl, userScript, stylePrompt, fullPrompt, styleId }) => {
      if (!user) return;
      const compressedUrl = await compressImage(imageUrl);

      await addHistoryItem({
        imageUrl: compressedUrl,
        userScript,
        stylePrompt,
        fullPrompt,
        styleId,
      });

      const items = await listHistory();
      setHistoryItems(items || []);
    },
    [user]
  );

  const deleteHistory = useCallback(
    async (itemId) => {
      if (!user) return;
      // Optimistic: remove immediately, restore on failure
      let removedItem;
      setHistoryItems((prev) => {
        removedItem = prev.find((item) => item.id === itemId);
        return prev.filter((item) => item.id !== itemId);
      });
      try {
        await removeHistoryItem(itemId);
      } catch (err) {
        if (removedItem) {
          setHistoryItems((prev) =>
            prev.some((item) => item.id === itemId) ? prev : [removedItem, ...prev]
          );
        }
        throw err;
      }
    },
    [user]
  );

  const deleteHistoryItems = useCallback(
    async (itemIds) => {
      if (!user || !itemIds?.length) return;
      const uniqueIds = Array.from(new Set(itemIds));
      const idSet = new Set(uniqueIds);
      // Optimistic: remove all targeted items immediately
      let removedItems;
      setHistoryItems((prev) => {
        removedItems = prev.filter((item) => idSet.has(item.id));
        return prev.filter((item) => !idSet.has(item.id));
      });
      const results = await Promise.allSettled(uniqueIds.map((id) => removeHistoryItem(id)));
      const failedIds = new Set(
        results
          .map((result, i) => (result.status === "rejected" ? uniqueIds[i] : null))
          .filter(Boolean)
      );
      if (failedIds.size > 0) {
        // Restore only the items that failed to delete
        const failedItems = (removedItems || []).filter((item) => failedIds.has(item.id));
        setHistoryItems((prev) => [...failedItems, ...prev]);
        throw new Error(`${failedIds.size} 筆紀錄刪除失敗`);
      }
    },
    [user]
  );

  return {
    historyItems,
    saveHistoryItem,
    deleteHistoryItem: deleteHistory,
    deleteHistoryItems,
  };
}
