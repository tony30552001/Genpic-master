import { useCallback, useEffect, useRef, useState } from "react";
import {
  createVideoProject,
  downloadVideo,
  draftVideoStoryboard,
  waitForVideoProject,
} from "../services/aiService";

const makeId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;

/**
 * Runs video turns. A turn either sends a confirmed `storyboard`, or a `brief`
 * that the storyboard agent first turns into `shotCount` shots ("直接生成").
 * Each turn is one video project; long storyboards run as several segments
 * that play back in order. Only single-segment turns are saved to history.
 */
export default function useVideoGeneration({ onSaved }) {
  const [turns, setTurns] = useState([]);
  const [activeTurnId, setActiveTurnId] = useState(null);
  const controllers = useRef(new Map());
  const urls = useRef(new Set());

  useEffect(() => () => {
    controllers.current.forEach((controller) => controller.abort());
    urls.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const updateTurn = useCallback((clientId, patch) => {
    setTurns((current) =>
      current.map((turn) => (turn.clientId === clientId ? { ...turn, ...patch } : turn))
    );
  }, []);

  const submit = useCallback(async ({
    storyboard: confirmed = null,
    brief = "",
    durationSeconds,
    shotCount = 1,
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
        durationSeconds,
        shotCount,
        status: confirmed ? "queued" : "drafting",
      },
    ]);
    setActiveTurnId(clientId);
    try {
      let storyboard = confirmed;
      if (!storyboard) {
        const drafted = await draftVideoStoryboard({
          modelKey,
          brief,
          durationSeconds,
          shotCount,
          hasStartFrame: Boolean(options.sourceUploadId || options.sourceImageJobId),
          signal: controller.signal,
        });
        storyboard = drafted.storyboard;
        updateTurn(clientId, { storyboard, status: "queued" });
      }
      const admission = await createVideoProject({ modelKey, storyboard, ...options });
      const { projectId } = admission;
      updateTurn(clientId, { projectId, segments: admission.segments });
      const completed = await waitForVideoProject({
        projectId,
        signal: controller.signal,
        onProgress: (project) => updateTurn(clientId, { status: project.status, segments: project.segments }),
      });
      const videoUrls = [];
      for (const segment of completed.segments) {
        const blob = await downloadVideo({ jobId: segment.jobId, signal: controller.signal });
        const url = URL.createObjectURL(blob);
        urls.current.add(url);
        videoUrls.push(url);
      }
      updateTurn(clientId, { status: "succeeded", segments: completed.segments, videoUrls });
      if (completed.segments.length === 1) {
        await onSaved?.({
          videoJobId: completed.segments[0].jobId,
          userScript: brief || storyboard.title,
          fullPrompt: completed.segments[0].prompt,
        });
      }
      return { projectId, videoUrls };
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
    activeTurnId,
    setActiveTurnId,
    submit,
    stopWaiting,
  };
}
