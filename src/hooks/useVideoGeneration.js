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

// A saved turn has no blob URLs. Turns without a project were interrupted
// before admission; turns whose project may still be running are resumed.
function restoreTurn(turn) {
  const restored = { ...turn, videoUrls: undefined };
  if (turn.mergeStatus === "merging") restored.mergeStatus = null;
  if (!turn.projectId) {
    return turn.status === "failed" ? restored : { ...restored, status: "failed", error: "已中斷，請重新生成" };
  }
  const segmentFailed = (turn.segments || []).some((segment) => segment.status === "failed");
  return segmentFailed ? restored : { ...restored, status: turn.status === "succeeded" ? "succeeded" : "queued", error: null };
}

/**
 * Runs video turns. A turn either sends a confirmed `storyboard`, or a `brief`
 * that the storyboard agent first turns into `shotCount` shots ("直接生成").
 * Each turn is one video project; long storyboards run as several segments
 * that play back in order. A single-segment turn is saved to history when it
 * finishes; a multi-segment turn only after `merge` joins it into one video.
 * `saved` marks a turn already in history. `initialTurns` come from a saved
 * session; their projects are followed again on mount without saving twice.
 */
export default function useVideoGeneration({ onSaved, initialTurns = null }) {
  const [turns, setTurns] = useState(() => (initialTurns || []).map(restoreTurn));
  const [resumable] = useState(() => turns.filter((turn) => turn.projectId && turn.status !== "failed"));
  const [activeTurnId, setActiveTurnId] = useState(null);
  const controllers = useRef(new Map());
  const urls = useRef(new Set());
  // Kept in a ref so restored turns are followed once, whatever the caller passes.
  const onSavedRef = useRef(onSaved);

  useEffect(() => {
    onSavedRef.current = onSaved;
  }, [onSaved]);

  useEffect(() => () => {
    controllers.current.forEach((controller) => controller.abort());
    urls.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const updateTurn = useCallback((clientId, patch) => {
    setTurns((current) =>
      current.map((turn) => (
        turn.clientId === clientId ? { ...turn, ...(typeof patch === "function" ? patch(turn) : patch) } : turn
      ))
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

  // Downloads each segment as soon as it succeeds into `segmentUrls` (keyed by
  // job id) so it can be previewed while the rest still run, then sets
  // `videoUrls` once every segment is ready. A single-segment turn is saved to
  // history here; a multi-segment one when it is merged.
  const follow = useCallback(async ({ clientId, projectId, brief, storyboard, saved = false, segmentUrls = {}, signal }) => {
    const downloads = new Map(Object.entries(segmentUrls).map(([jobId, url]) => [jobId, Promise.resolve(url)]));
    const fetchSegment = (segment) => {
      if (!downloads.has(segment.jobId)) {
        downloads.set(segment.jobId, downloadVideoSegment({ jobId: segment.jobId, signal }).then((blob) => {
          const url = objectUrl(blob);
          updateTurn(clientId, (turn) => ({ segmentUrls: { ...turn.segmentUrls, [segment.jobId]: url } }));
          return url;
        }));
      }
      return downloads.get(segment.jobId);
    };
    const completed = await waitForVideoProject({
      projectId,
      signal,
      onProgress: (project) => {
        updateTurn(clientId, { status: project.status, segments: project.segments });
        // Preview failures resurface when the finished turn awaits the same download.
        project.segments
          .filter((segment) => segment.status === "succeeded")
          .forEach((segment) => fetchSegment(segment).catch(() => {}));
      },
    });
    const videoUrls = await Promise.all(completed.segments.map(fetchSegment));
    updateTurn(clientId, { status: "succeeded", segments: completed.segments, videoUrls });
    if (completed.segments.length === 1 && !saved) {
      await onSavedRef.current?.({
        videoProjectId: projectId,
        userScript: brief || storyboard.title,
        fullPrompt: completed.segments[0].prompt,
      });
      updateTurn(clientId, { saved: true });
    }
    return { projectId, videoUrls };
  }, [objectUrl, updateTurn]);

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
        saved: turn.saved,
        segmentUrls: turn.segmentUrls,
        signal: controller.signal,
      });
    } catch (error) {
      fail(clientId, error);
    } finally {
      controllers.current.delete(clientId);
    }
  }, [fail, follow, updateTurn]);

  useEffect(() => {
    const resumed = resumable.map((turn) => {
      const controller = new AbortController();
      controllers.current.set(turn.clientId, controller);
      const run = turn.mergeStatus === "merged"
        ? downloadVideo({ projectId: turn.projectId, signal: controller.signal }).then((blob) => {
            updateTurn(turn.clientId, { videoUrls: [objectUrl(blob)] });
          })
        : follow({
            clientId: turn.clientId,
            projectId: turn.projectId,
            brief: turn.brief,
            storyboard: turn.storyboard,
            saved: turn.saved,
            signal: controller.signal,
          });
      run.catch((error) => fail(turn.clientId, error)).finally(() => {
        if (controllers.current.get(turn.clientId) === controller) controllers.current.delete(turn.clientId);
      });
      return controller;
    });
    return () => resumed.forEach((controller) => controller.abort());
  }, [fail, follow, objectUrl, resumable, updateTurn]);

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
      if (!turn.saved) {
        await onSavedRef.current?.({
          videoProjectId: turn.projectId,
          userScript: turn.brief || turn.storyboard.title,
          fullPrompt: turn.segments.map((segment) => segment.prompt).join("\n\n"),
        });
      }
      releaseUrls(Object.values(turn.segmentUrls || {}));
      updateTurn(turn.clientId, { mergeStatus: "merged", saved: true, videoUrls: [url], segmentUrls: undefined });
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
  }, [objectUrl, releaseUrls, updateTurn]);

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
