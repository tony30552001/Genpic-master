import { useCallback, useEffect, useRef, useState } from "react";

import {
  MAX_DOCUMENT_FILE_SIZE,
  isSupportedDocumentFile,
} from "../lib/documentFormats";
import {
  createDeckJob,
  downloadDeckJobPptx,
  getDeckJob,
  getDeckSlidePreview,
  listPptTemplates,
  waitForDeckJob,
} from "../services/aiService";
import { uploadFile } from "../services/storageService";

const INITIAL_PROGRESS = { phase: "", current: 0, total: 0, startedAt: null };
const ACTIVE_JOB_STORAGE_KEY = "genpic_deck_job";

const readActiveJobId = () => {
  try {
    return localStorage.getItem(ACTIVE_JOB_STORAGE_KEY) || null;
  } catch {
    return null;
  }
};

const writeActiveJobId = (jobId) => {
  try {
    if (jobId) localStorage.setItem(ACTIVE_JOB_STORAGE_KEY, jobId);
    else localStorage.removeItem(ACTIVE_JOB_STORAGE_KEY);
  } catch {
    /* 無法寫入時只會失去續傳能力，不影響伺服器上的生成 */
  }
};

const toProgress = (job, fallbackTotal = 0) => ({
  phase:
    job?.phase ||
    (job?.status === "queued" ? "排隊中，等待生成器空出資源" : "產生簡報中"),
  current: job?.progress?.current || 0,
  total: job?.progress?.total || fallbackTotal || 0,
  startedAt: job?.startedAt || job?.createdAt || null,
});

const toDeck = (job) => ({
  jobId: job.jobId,
  title: job.deckTitle,
  fileName: job.fileName,
  slideCount: job.slideCount,
});

const toSlides = (job) =>
  (job?.slides || []).map((slide) => ({
    slideNumber: slide.slideNumber,
    revision: slide.revision,
    title: slide.title,
  }));

/** 只有頁碼或 revision 真的變了才需要重新抓預覽，輪詢本身不該觸發。 */
const slidesCacheKey = (slides) =>
  slides.map((slide) => `${slide.slideNumber}:${slide.revision}`).join(",");

/**
 * 只有「伺服器判定工作失敗」或「工作已不存在」才該清掉本機紀錄。
 * 網路中斷、休眠、暫時性 5xx 都要保留 jobId，回到頁面時才接得回去。
 */
const isJobGone = (watchError) =>
  Boolean(watchError?.jobFailed) || watchError?.status === 404;

const describeWatchFailure = (watchError) => {
  const message = watchError?.message || "簡報生成失敗，請稍後重試。";
  if (isJobGone(watchError)) return message;
  return `${message}（簡報仍在雲端生成，回到此頁會自動接續）`;
};

/**
 * PPT Master 簡報生成 Hook：建立非同步 job、輪詢進度、下載 PPTX。
 *
 * 生成需要 5–15 分鐘，而工作完全跑在伺服器上，因此進行中的 jobId 會存進
 * localStorage。切換頁籤、重新整理、甚至關掉瀏覽器再回來，都會自動接回同一個工作。
 */
export default function usePptMasterDeck() {
  const [templates, setTemplates] = useState({ styles: [], layouts: [] });
  const [templatesError, setTemplatesError] = useState(null);
  const [isGenerating, setIsGenerating] = useState(() => Boolean(readActiveJobId()));
  const [progress, setProgress] = useState(INITIAL_PROGRESS);
  const [events, setEvents] = useState([]);
  const [slides, setSlides] = useState([]);
  const [slidePreviews, setSlidePreviews] = useState({});
  const [jobId, setJobId] = useState(() => readActiveJobId());
  const [deck, setDeck] = useState(null);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);
  const previewsRef = useRef(new Map());
  const pendingPreviewsRef = useRef(new Set());

  /** 換掉或清空預覽時一定要釋放 object URL，長時間輪詢才不會漏記憶體。 */
  const releasePreviews = useCallback(() => {
    previewsRef.current.forEach((preview) => URL.revokeObjectURL(preview.url));
    previewsRef.current.clear();
    pendingPreviewsRef.current.clear();
    setSlidePreviews({});
  }, []);

  useEffect(() => releasePreviews, [releasePreviews]);

  /** 輪詢每 4 秒回傳一次相同的清單，identity 保持穩定才不會一直重抓預覽。 */
  const updateSlides = useCallback((job) => {
    const next = toSlides(job);
    setSlides((current) =>
      slidesCacheKey(current) === slidesCacheKey(next) ? current : next
    );
  }, []);

  /**
   * 逐頁抓取已完成的 SVG 預覽。以 revision 當快取鍵：品質修正重寫某一頁時
   * revision 會加一，這裡才會重抓並釋放舊的 object URL。
   * 預覽失敗只讓那一格維持骨架，不影響生成流程與既有的錯誤語意。
   */
  useEffect(() => {
    if (!jobId || slides.length === 0) return undefined;
    let cancelled = false;

    (async () => {
      for (const slide of slides) {
        if (cancelled) return;

        const cached = previewsRef.current.get(slide.slideNumber);
        if (cached && cached.revision >= slide.revision) continue;

        const pendingKey = `${slide.slideNumber}:${slide.revision}`;
        if (pendingPreviewsRef.current.has(pendingKey)) continue;
        pendingPreviewsRef.current.add(pendingKey);

        try {
          const blob = await getDeckSlidePreview({
            jobId,
            slideNumber: slide.slideNumber,
          });
          if (cancelled) return;

          const previous = previewsRef.current.get(slide.slideNumber);
          if (previous && previous.revision >= slide.revision) continue;

          if (previous?.url) URL.revokeObjectURL(previous.url);
          previewsRef.current.set(slide.slideNumber, {
            revision: slide.revision,
            title: slide.title,
            url: URL.createObjectURL(blob),
          });
          setSlidePreviews(Object.fromEntries(previewsRef.current));
        } catch {
          /* 這一頁的預覽抓不到就維持骨架 */
        } finally {
          pendingPreviewsRef.current.delete(pendingKey);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [jobId, slides]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    listPptTemplates({ signal: controller.signal })
      .then((catalog) => {
        if (cancelled) return;
        setTemplates({
          styles: catalog?.styles || [],
          layouts: catalog?.layouts || [],
        });
        setTemplatesError(null);
      })
      .catch((loadError) => {
        if (cancelled || loadError?.name === "AbortError") return;
        setTemplatesError(loadError.message || "無法載入簡報模板");
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const watchJob = useCallback(
    async ({ jobId: watchedJobId, signal, slideCount }) => {
      const finished = await waitForDeckJob({
        jobId: watchedJobId,
        signal,
        onProgress: (update) => {
          setProgress(toProgress(update, slideCount));
          setEvents(update?.events || []);
          updateSlides(update);
        },
      });

      const result = toDeck(finished);
      setDeck(result);
      setEvents(finished.events || []);
      updateSlides(finished);
      setProgress({
        phase: "已完成",
        current: finished.progress?.total || 0,
        total: finished.progress?.total || 0,
        startedAt: finished.startedAt || finished.createdAt || null,
      });
      return result;
    },
    [updateSlides]
  );

  /** 掛載時接回仍在進行（或已完成但尚未下載）的工作，切換頁籤才不會弄丟結果。 */
  useEffect(() => {
    const activeJobId = readActiveJobId();
    if (!activeJobId) return undefined;

    const controller = new AbortController();
    abortRef.current = controller;
    let cancelled = false;

    (async () => {
      let job = null;
      try {
        job = await getDeckJob({ jobId: activeJobId, signal: controller.signal });
      } catch (lookupError) {
        if (cancelled || lookupError?.name === "AbortError") return;
        setIsGenerating(false);
        if (lookupError?.status === 404) {
          writeActiveJobId(null);
          setJobId(null);
          return;
        }
        setError(lookupError.message || "無法讀取先前的簡報生成工作");
        return;
      }

      if (cancelled) return;

      setEvents(job?.events || []);
      updateSlides(job);

      if (job?.status === "succeeded") {
        setDeck(toDeck(job));
        setIsGenerating(false);
        return;
      }
      if (job?.status === "failed") {
        writeActiveJobId(null);
        setError(job.error?.message || "簡報生成失敗，請稍後重試");
        setIsGenerating(false);
        return;
      }

      setIsGenerating(true);
      setProgress(toProgress(job, job?.slideCount));

      try {
        await watchJob({
          jobId: activeJobId,
          signal: controller.signal,
          slideCount: job?.slideCount,
        });
      } catch (watchError) {
        if (cancelled || watchError?.name === "AbortError") return;
        if (isJobGone(watchError)) writeActiveJobId(null);
        setError(describeWatchFailure(watchError));
        setProgress(INITIAL_PROGRESS);
      } finally {
        if (!cancelled) setIsGenerating(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [updateSlides, watchJob]);

  const generate = useCallback(
    async ({
      topic,
      file,
      slideCount,
      imageDensity,
      styleId,
      layoutId,
      recipeId,
      briefPurpose,
      briefAudience,
      briefOutcome,
    }) => {
      const trimmedTopic = String(topic || "").trim();
      if (!file && trimmedTopic.length < 4) {
        throw new Error("請輸入至少 4 個字的簡報主題，或上傳一份文件。");
      }
      if (file) {
        if (!isSupportedDocumentFile(file)) {
          throw new Error(
            "不支援的檔案格式。請上傳 PDF、Office、OpenDocument、RTF、EPUB、CSV、文字或圖片檔案。"
          );
        }
        if (file.size > MAX_DOCUMENT_FILE_SIZE) {
          throw new Error("檔案大小超過 50MB 限制。");
        }
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsGenerating(true);
      setError(null);
      setDeck(null);
      setEvents([]);
      setSlides([]);
      setJobId(null);
      releasePreviews();
      setProgress({
        phase: "準備中",
        current: 0,
        total: slideCount || 0,
        startedAt: new Date().toISOString(),
      });

      try {
        let sourceUploadId = null;
        if (file) {
          setProgress((current) => ({ ...current, phase: "上傳文件到雲端儲存空間" }));
          const uploadResult = await uploadFile(file, "document");
          sourceUploadId = uploadResult?.uploadId || null;
          if (!sourceUploadId) throw new Error("文件上傳未完成，請稍後重試。");
        }

        const job = await createDeckJob({
          topic: trimmedTopic || null,
          sourceUploadId,
          fileName: file?.name || null,
          slideCount,
          imageDensity,
          styleId: styleId || null,
          layoutId: layoutId || null,
          recipeId: recipeId || null,
          briefPurpose: briefPurpose || null,
          briefAudience: briefAudience || null,
          briefOutcome: briefOutcome || null,
          signal: controller.signal,
        });
        writeActiveJobId(job.jobId);
        setJobId(job.jobId);

        return await watchJob({ jobId: job.jobId, signal: controller.signal, slideCount });
      } catch (generationError) {
        if (generationError?.name === "AbortError") {
          setProgress(INITIAL_PROGRESS);
          throw generationError;
        }
        if (isJobGone(generationError) || !readActiveJobId()) {
          writeActiveJobId(null);
          setError(generationError.message || "簡報生成失敗，請稍後重試。");
        } else {
          setError(describeWatchFailure(generationError));
        }
        setProgress(INITIAL_PROGRESS);
        throw generationError;
      } finally {
        setIsGenerating(false);
      }
    },
    [releasePreviews, watchJob]
  );

  /** 停止在這台裝置追蹤工作；伺服器上的生成不會因此中止。 */
  const stopWatching = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    writeActiveJobId(null);
    setJobId(null);
    setIsGenerating(false);
    setProgress(INITIAL_PROGRESS);
    setEvents([]);
    setSlides([]);
    releasePreviews();
  }, [releasePreviews]);

  const download = useCallback(async () => {
    if (!deck?.jobId) return;
    const blob = await downloadDeckJobPptx({ jobId: deck.jobId });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = deck.fileName || "presentation.pptx";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [deck]);

  const reset = useCallback(() => {
    writeActiveJobId(null);
    setJobId(null);
    setDeck(null);
    setError(null);
    setProgress(INITIAL_PROGRESS);
    setEvents([]);
    setSlides([]);
    releasePreviews();
  }, [releasePreviews]);

  return {
    templates,
    templatesError,
    isGenerating,
    progress,
    events,
    slides,
    slidePreviews,
    deck,
    error,
    generate,
    stopWatching,
    download,
    reset,
  };
}
