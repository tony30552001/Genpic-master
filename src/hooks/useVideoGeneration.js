import { useCallback, useEffect, useRef, useState } from "react";
import {
  createVideoProject,
  downloadVideo,
  downloadVideoSegment,
  draftVideoStoryboard,
  renderVideoProject,
  retryVideoProject,
  waitForVideoProject,
  waitForVideoRender,
} from "../services/aiService";

const makeId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;

/**
 * Runs video turns. A turn either sends a confirmed `storyboard`, or a `brief`
 * that the storyboard agent first turns into `shotCount` shots ("直接生成").
 * Each turn is one video project; long storyboards run as several segments
 * that play back in order. A single-segment turn is saved to history when it
 * finishes; a multi-segment turn only after `merge` joins it into one video.
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

  const objectUrl = useCallback((blob) => {
    const url = URL.createObjectURL(blob);
    urls.current.add(url);
    return url;
  }, []);

  const releaseUrls = useCallback((list) => {
    list.forEach((url) => {
      URL.revokeObjectURL(url);
      urls.current.delete(url);
    });
  }, []);

  // Waits for every segment, then downloads them. A single-segment turn is
  // saved to history here; a multi-segment one when it is merged.
  const follow = useCallback(async ({ clientId, projectId, brief, storyboard, signal }) => {
    const completed = await waitForVideoProject({
      projectId,
      signal,
      onProgress: (project) => updateTurn(clientId, { status: project.status, segments: project.segments }),
    });
    const videoUrls = [];
    for (const segment of completed.segments) {
      videoUrls.push(objectUrl(await downloadVideoSegment({ jobId: segment.jobId, signal })));
    }
    updateTurn(clientId, { status: "succeeded", segments: completed.segments, videoUrls });
    if (completed.segments.length === 1) {
      await onSaved?.({
        videoProjectId: projectId,
        userScript: brief || storyboard.title,
        fullPrompt: completed.segments[0].prompt,
      });
    }
    return { projectId, videoUrls };
  }, [objectUrl, onSaved, updateTurn]);

  const fail = useCallback((clientId, error) => {
    if (error?.name !== "AbortError") {
      updateTurn(clientId, {
        status: "failed",
        error: error.message || "影片生成失敗，請稍後重試",
      });
    }
  }, [updateTurn]);

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
      return await follow({ clientId, projectId, brief, storyboard, signal: controller.signal });
    } catch (error) {
      fail(clientId, error);
      throw error;
    } finally {
      controllers.current.delete(clientId);
    }
  }, [fail, follow, updateTurn]);

  // Requeues the failed segments of a turn's project and waits again;
  // segments that already succeeded are not generated again.
  const retryFailed = useCallback(async (turn) => {
    const { clientId } = turn;
    const controller = new AbortController();
    controllers.current.set(clientId, controller);
    updateTurn(clientId, { status: "queued", error: null });
    try {
      const project = await retryVideoProject({ projectId: turn.projectId });
      updateTurn(clientId, { status: project.status, segments: project.segments });
      await follow({
        clientId,
        projectId: turn.projectId,
        brief: turn.brief,
        storyboard: turn.storyboard,
        signal: controller.signal,
      });
    } catch (error) {
      fail(clientId, error);
    } finally {
      controllers.current.delete(clientId);
    }
  }, [fail, follow, updateTurn]);

  // Joins a finished multi-segment turn into one video, replaces the segment
  // playback with it and saves it to history. Asking again after a failure
  // reuses a render that already succeeded, so a failed save can be retried.
  const merge = useCallback(async (turn) => {
    const controller = new AbortController();
    controllers.current.set(turn.clientId, controller);
    updateTurn(turn.clientId, { mergeStatus: "merging", mergeError: null });
    let url = null;
    try {
      await renderVideoProject({ projectId: turn.projectId });
      await waitForVideoRender({ projectId: turn.projectId, signal: controller.signal });
      url = objectUrl(await downloadVideo({ projectId: turn.projectId, signal: controller.signal }));
      await onSaved?.({
        videoProjectId: turn.projectId,
        userScript: turn.brief || turn.storyboard.title,
        fullPrompt: turn.segments.map((segment) => segment.prompt).join("\n\n"),
      });
      releaseUrls(turn.videoUrls);
      updateTurn(turn.clientId, { mergeStatus: "merged", videoUrls: [url] });
    } catch (error) {
      if (url) releaseUrls([url]);
      if (error?.name !== "AbortError") {
        updateTurn(turn.clientId, {
          mergeStatus: "failed",
          mergeError: error.message || "影片合併失敗，請重新合併",
        });
      }
    } finally {
      controllers.current.delete(turn.clientId);
    }
  }, [objectUrl, onSaved, releaseUrls, updateTurn]);

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
    retryFailed,
    merge,
    stopWaiting,
  };
}
