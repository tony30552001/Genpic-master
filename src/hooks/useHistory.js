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
      await removeHistoryItem(itemId);
      const items = await listHistory();
      setHistoryItems(items || []);
    },
    [user]
  );

  return {
    historyItems,
    saveHistoryItem,
    deleteHistoryItem: deleteHistory,
  };
}
