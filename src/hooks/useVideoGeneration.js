import { useCallback, useEffect, useRef, useState } from "react";
import {
  createVideoJob,
  downloadVideo,
  draftVideoStoryboard,
  waitForVideoJob,
} from "../services/aiService";

const makeId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;

/**
 * Runs video turns. A turn either sends a confirmed `storyboard`, or a `brief`
 * that the storyboard agent first turns into a single shot ("直接生成").
 */
export default function useVideoGeneration({ onSaved }) {
  const [turns, setTurns] = useState([]);
  const [activeJobId, setActiveJobId] = useState(null);
  const controllers = useRef(new Map());
  const urls = useRef(new Set());

  useEffect(() => () => {
    controllers.current.forEach((controller) => controller.abort());
    urls.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const updateTurn = useCallback((clientId, patch) => {
    setTurns((current) =>
      current.map((turn) =>
        turn.clientId === clientId
          ? { ...turn, ...(typeof patch === "function" ? patch(turn) : patch) }
          : turn
      )
    );
  }, []);

  const submit = useCallback(async ({
    storyboard: confirmed = null,
    brief = "",
    durationSeconds,
    modelKey,
    ...options
  }) => {
    const clientId = makeId();
    const controller = new AbortController();
    controllers.current.set(clientId, controller);
    setTurns((current) => [
      ...current,
      {
        clientId,
        createdAt: Date.now(),
        brief,
        storyboard: confirmed,
        modelKey,
        options,
        status: confirmed ? "queued" : "drafting",
      },
    ]);
    try {
      let storyboard = confirmed;
      if (!storyboard) {
        const drafted = await draftVideoStoryboard({
          modelKey,
          brief,
          durationSeconds,
          shotCount: 1,
          hasStartFrame: Boolean(options.sourceUploadId || options.sourceImageJobId),
          signal: controller.signal,
        });
        storyboard = drafted.storyboard;
        updateTurn(clientId, { storyboard, status: "queued" });
      }
      const admission = await createVideoJob({ modelKey, storyboard, ...options });
      const jobId = admission.jobId;
      updateTurn(clientId, { jobId, status: admission.status, phase: admission.phase });
      setActiveJobId(jobId);
      const completed = await waitForVideoJob({
        jobId,
        signal: controller.signal,
        onProgress: (job) =>
          updateTurn(clientId, {
            status: job.status,
            phase: job.phase,
          }),
      });
      const blob = await downloadVideo({ jobId, signal: controller.signal });
      const videoUrl = URL.createObjectURL(blob);
      urls.current.add(videoUrl);
      updateTurn(clientId, {
        status: completed.status,
        phase: completed.phase,
        videoUrl,
        completedAt: completed.completedAt,
      });
      await onSaved?.({
        videoJobId: jobId,
        userScript: brief || storyboard.title,
        fullPrompt: completed.prompt,
      });
      return { jobId, videoUrl };
    } catch (error) {
      if (error?.name !== "AbortError") {
        updateTurn(clientId, {
          status: "failed",
          error: error.message || "影片生成失敗，請稍後重試",
        });
      }
      throw error;
    } finally {
      controllers.current.delete(clientId);
    }
  }, [onSaved, updateTurn]);

  const stopWaiting = useCallback((clientId) => {
    controllers.current.get(clientId)?.abort();
    controllers.current.delete(clientId);
    updateTurn(clientId, { status: "failed", error: "已停止等待；遠端工作若已送出仍會繼續執行。" });
  }, [updateTurn]);

  return {
    turns,
    activeJobId,
    setActiveJobId,
    submit,
    stopWaiting,
  };
}

