import { useCallback, useEffect, useRef, useState } from "react";
import {
  createVideoJob,
  downloadVideo,
  optimizeVideoPrompt,
  waitForVideoJob,
} from "../services/aiService";

const makeId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;

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
    prompt,
    optimize = true,
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
        prompt,
        modelKey,
        options,
        status: "optimizing",
        explanation: "",
      },
    ]);
    try {
      let optimizedPrompt = prompt;
      let explanation = "";
      if (optimize) {
        const optimized = await optimizeVideoPrompt({
          prompt,
          signal: controller.signal,
        });
        optimizedPrompt = optimized.optimizedPrompt;
        explanation = optimized.explanation;
      }
      updateTurn(clientId, { status: "queued", optimizedPrompt, explanation });
      const admission = await createVideoJob({
        modelKey,
        prompt: optimizedPrompt,
        originalPrompt: prompt,
        ...options,
      });
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
        userScript: prompt,
        fullPrompt: optimizedPrompt,
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
    updateTurn(clientId, { status: "failed", error: "已停止等待；遠端工作未取消，仍可能產生費用。" });
  }, [updateTurn]);

  return {
    turns,
    activeJobId,
    setActiveJobId,
    submit,
    stopWaiting,
  };
}
