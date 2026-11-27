import { useCallback, useEffect, useRef, useState } from "react";
import {
  cancelVideoProject, createVideoProject, draftVideoStoryboard, renderVideoProject,
  retryVideoProject, waitForVideoProject, waitForVideoRender,
} from "../services/aiService";

const restoreTurn = (turn) => turn.projectId || ["failed", "cancelled"].includes(turn.status)
  ? turn : { ...turn, status: "failed", error: "已中斷，請重新生成" };

export default function useVideoGeneration({ onSaved, onMerged, initialTurns = null }) {
  const [turns, setTurns] = useState(() => (initialTurns || []).map(restoreTurn));
  const [resumable] = useState(() => turns.filter((turn) => turn.projectId && turn.status !== "cancelled"
    && !(turn.saved && turn.status === "succeeded")));
  const [activeTurnId, setActiveTurnId] = useState(null);
  const controllers = useRef(new Map());
  const drafting = useRef(new Set());
  const callbacks = useRef({ onSaved, onMerged });
  useEffect(() => { callbacks.current = { onSaved, onMerged }; }, [onSaved, onMerged]);
  useEffect(() => {
    const active = controllers.current;
    return () => active.forEach((controller) => controller.abort());
  }, []);

  const update = useCallback((clientId, patch) => {
    setTurns((current) => current.map((turn) => turn.clientId === clientId ? { ...turn, ...patch } : turn));
  }, []);

  const finishRender = useCallback(async (turn, signal, retry = false) => {
    const { clientId, projectId } = turn;
    update(clientId, { mergeStatus: "merging", mergeError: null });
    let render = null;
    try {
      if (retry) await renderVideoProject({ projectId });
      render = await waitForVideoRender({ projectId, signal });
    } catch (error) {
      if (!signal.aborted) update(clientId, { mergeStatus: "failed", mergeError: error.message });
      return;
    }
    if (signal.aborted) return;
    update(clientId, { mergeStatus: "merged", saved: true, hasSubtitles: Boolean(render?.hasSubtitles) });
    try {
      await callbacks.current.onMerged?.();
    } catch (error) {
      if (!signal.aborted) update(clientId, { error: `影片已入庫，但素材清單更新失敗：${error.message}` });
    }
  }, [update]);

  const follow = useCallback(async (turn, signal) => {
    const { clientId, projectId } = turn;
    const project = await waitForVideoProject({
      projectId, signal,
      onProgress: ({ status, segments, needsRender, hasSubtitles }) => {
        if (!signal.aborted) {
          update(clientId, {
            status,
            segments,
            needsRender: Boolean(needsRender ?? segments.length !== 1),
            ...(hasSubtitles ? { hasSubtitles: true } : {}),
          });
        }
      },
    });
    if (signal.aborted) return;
    const needsRender = Boolean(project.needsRender ?? project.segments.length !== 1);
    update(clientId, { status: project.status, segments: project.segments, needsRender, hasSubtitles: Boolean(project.hasSubtitles) });
    if (project.status === "cancelled") return;
    if (needsRender) {
      await finishRender(turn, signal);
    } else if (!turn.saved && project.segments[0]) {
      await callbacks.current.onSaved?.({
        videoProjectId: projectId, userScript: turn.brief || turn.storyboard.title, fullPrompt: project.segments[0].prompt,
      });
      if (!signal.aborted) update(clientId, { saved: true });
    }
  }, [finishRender, update]);

  const run = useCallback(async (clientId, work, onError) => {
    const controller = new AbortController();
    controllers.current.get(clientId)?.abort();
    controllers.current.set(clientId, controller);
    try {
      await work(controller.signal);
    } catch (error) {
      if (!controller.signal.aborted) {
        if (onError) onError(error);
        else update(clientId, { status: "failed", error: error.message || "影片生成失敗，請稍後重試" });
      }
    } finally {
      if (controllers.current.get(clientId) === controller) controllers.current.delete(clientId);
    }
  }, [update]);

  useEffect(() => {
    resumable.forEach((turn) => { void run(turn.clientId, (signal) => follow(turn, signal)); });
  }, [follow, resumable, run]);

  const submit = async ({
    storyboard: confirmed = null, brief = "", durationSeconds, shotCount = 1, modelKey, baseProjectId = null, replace = null, ...options
  }) => {
    const clientId = replace?.clientId || globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    const turn = { clientId, createdAt: replace?.createdAt || Date.now(), brief, storyboard: confirmed, durationSeconds, shotCount,
      modelKey, options, status: confirmed ? "queued" : "drafting" };
    if (replace) update(clientId, { status: "queued", error: null, projectId: null, segments: [] });
    else setTurns((current) => [...current, turn]);
    setActiveTurnId(clientId);
    let admitted = false;
    await run(clientId, async (signal) => {
      let storyboard = confirmed;
      if (!storyboard) {
        drafting.current.add(clientId);
        try {
          ({ storyboard } = await draftVideoStoryboard({
            modelKey, brief, durationSeconds, shotCount, hasStartFrame: Boolean(options.sourceUploadId || options.sourceImageJobId), signal,
          }));
        } finally {
          drafting.current.delete(clientId);
        }
      }
      if (signal.aborted) return;
      update(clientId, { storyboard, status: "queued" });
      const created = await createVideoProject({ modelKey, storyboard, ...options, ...(baseProjectId && { baseProjectId }) });
      const { projectId, segments } = created;
      const finalStoryboard = created.storyboard || storyboard;
      const needsRender = Boolean(created.needsRender ?? segments.length !== 1);
      admitted = true;
      if (signal.aborted) return;
      const next = {
        ...turn,
        storyboard: finalStoryboard,
        projectId,
        segments,
        needsRender,
        hasSubtitles: false,
        status: "queued",
        saved: false,
        mergeStatus: null,
        mergeError: null,
      };
      update(clientId, next);
      await follow(next, signal);
    }, (error) => {
      if (replace && !admitted) setTurns((current) => current.map((item) => item.clientId === clientId ? replace : item));
      else update(clientId, { status: "failed", error: error.message });
      throw error;
    });
  };

  const retryFailed = (turn) => run(turn.clientId, async (signal) => {
    update(turn.clientId, { status: "queued", error: null });
    await retryVideoProject({ projectId: turn.projectId });
    await follow(turn, signal);
  });

  const cancel = async (turn) => {
    if (!turn.projectId && turn.status === "drafting") {
      if (!drafting.current.has(turn.clientId)) throw new Error("已開始送出影片，請等候排隊狀態更新");
      controllers.current.get(turn.clientId)?.abort();
      update(turn.clientId, { status: "cancelled" });
      return;
    }
    const project = await cancelVideoProject({ projectId: turn.projectId });
    // Submitted segments remain billable and keep polling. A terminal response
    // aborts any older in-flight read so it cannot overwrite the cancellation.
    if (project.status === "cancelled") controllers.current.get(turn.clientId)?.abort();
    update(turn.clientId, { status: project.status, segments: project.segments });
  };

  return { turns, activeTurnId, setActiveTurnId, submit, retryFailed, cancel,
    retryMerge: (turn) => run(turn.clientId, (signal) => finishRender(turn, signal, true)) };
}
