import { useCallback, useEffect, useRef, useState } from "react";
import {
  draftVideoStoryboard,
  inspectVideoStoryboard,
  reviseVideoStoryboard,
  scriptToVideoStoryboard,
} from "../services/aiService";
import { uploadFile } from "../services/storageService";
import { readFileAsDataUrl } from "../lib/imageFile";
import { MAX_DOCUMENT_FILE_SIZE, getDocumentExtension } from "../lib/documentFormats";
import {
  MAX_CHARACTER_IMAGE_BYTES,
  SCRIPT_DOCUMENT_EXTENSIONS,
  storyboardSeconds,
} from "../lib/videoStoryboard";

const INSPECT_DELAY_MS = 400;

const makeId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;

const boardCharacters = (board) => board?.storyboard.global.characters || [];

const summarize = (storyboard, warnings) => ({
  title: storyboard.title,
  seconds: storyboardSeconds(storyboard),
  shots: storyboard.shots.map((shot) => ({
    id: shot.id,
    warned: warnings.some((warning) => warning.shotId === shot.id),
  })),
});

/**
 * Owns the storyboard being reviewed: the agent conversation (draft, revise,
 * fromScript), local edits, and the server-side inspection that returns
 * warnings and the per-segment payload preview for every edit. Character images
 * are uploaded here; `previews` maps their upload ids, and those of images
 * imported from a script document, to thumbnails (a reopened storyboard has
 * none, so the UI falls back to labels). `progress` is the running agent job's
 * latest snapshot (steps, reasoning summary, finished shots); its reasoning is
 * kept on the storyboard message it produced.
 */
export default function useVideoStoryboard({ modelKey, hasStartFrame }) {
  const [board, setBoard] = useState(null);
  const [messages, setMessages] = useState([]);
  const [pending, setPending] = useState(null);
  const [progress, setProgress] = useState(null);
  const [inspection, setInspection] = useState({ status: "idle", error: "", config: "" });
  const [previews, setPreviews] = useState({});
  const boardRef = useRef(board);
  const agentController = useRef(null);
  const inspectController = useRef(null);
  const inspectTimer = useRef(null);
  const latest = useRef({ modelKey, hasStartFrame });
  const config = `${modelKey}|${hasStartFrame}`;

  useEffect(() => {
    boardRef.current = board;
  }, [board]);

  useEffect(() => () => {
    agentController.current?.abort();
    inspectController.current?.abort();
    clearTimeout(inspectTimer.current);
  }, []);

  const inspect = useCallback(async (storyboard) => {
    inspectController.current?.abort();
    const controller = new AbortController();
    inspectController.current = controller;
    const inspectedConfig = `${latest.current.modelKey}|${latest.current.hasStartFrame}`;
    setInspection({ status: "loading", error: "", config: inspectedConfig });
    try {
      const result = await inspectVideoStoryboard({
        modelKey: latest.current.modelKey,
        storyboard,
        hasStartFrame: latest.current.hasStartFrame,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setBoard((current) => current && {
        ...current,
        warnings: result.warnings,
        segments: result.segments,
      });
      setInspection({ status: "ready", error: "", config: inspectedConfig });
    } catch (error) {
      if (error?.name === "AbortError") return;
      setInspection({ status: "invalid", error: error.message || "分鏡檢查失敗", config: inspectedConfig });
    }
  }, []);

  const queueInspect = useCallback((storyboard) => {
    clearTimeout(inspectTimer.current);
    inspectController.current?.abort();
    inspectTimer.current = setTimeout(() => void inspect(storyboard), INSPECT_DELAY_MS);
  }, [inspect]);

  const scheduleInspect = useCallback((storyboard) => {
    queueInspect(storyboard);
    setInspection((current) => ({ ...current, status: "loading", error: "" }));
  }, [queueInspect]);

  // A model or start-frame change re-inspects; until it resolves the stale result reads as loading.
  useEffect(() => {
    latest.current = { modelKey, hasStartFrame };
    if (boardRef.current) queueInspect(boardRef.current.storyboard);
  }, [modelKey, hasStartFrame, queueInspect]);

  const addMessage = useCallback((message) => {
    setMessages((current) => [...current, { id: makeId(), createdAt: Date.now(), ...message }]);
  }, []);

  const runAgent = useCallback(async ({ kind, userText, attachment, request, onResult, replaceBoard = false }) => {
    agentController.current?.abort();
    const controller = new AbortController();
    agentController.current = controller;
    if (replaceBoard) {
      clearTimeout(inspectTimer.current);
      inspectController.current?.abort();
      setBoard(null);
    }
    addMessage({ role: "user", text: userText, attachment });
    setPending(kind);
    setProgress(null);
    let reasoning = "";
    const onProgress = (snapshot) => {
      if (controller.signal.aborted) return;
      reasoning = snapshot?.reasoning || reasoning;
      setProgress(snapshot);
    };
    try {
      const result = await request(controller.signal, onProgress);
      clearTimeout(inspectTimer.current);
      inspectController.current?.abort();
      setInspection({ status: "ready", error: "", config: `${latest.current.modelKey}|${latest.current.hasStartFrame}` });
      onResult(result, reasoning);
    } catch (error) {
      if (error?.name === "AbortError") return;
      addMessage({ role: "assistant", kind: "error", text: error.message || "分鏡 AI 暫時無法回應，請稍後重試" });
    } finally {
      if (agentController.current === controller) {
        agentController.current = null;
        setPending(null);
        setProgress(null);
      }
    }
  }, [addMessage]);

  const acceptResult = useCallback((result, extra) => {
    setBoard((current) => ({
      revision: (current?.revision ?? 0) + 1,
      storyboard: result.storyboard,
      warnings: result.warnings,
      segments: result.segments,
      shotNotes: result.shotNotes ?? (extra.keepNotes ? current?.shotNotes : {}) ?? {},
      changedShotIds: extra.changedShotIds || [],
      reopened: extra.keepNotes ? Boolean(current?.reopened) : false,
    }));
    addMessage({
      role: "assistant",
      kind: "storyboard",
      text: result.explanation || "",
      reasoning: extra.reasoning || "",
      questions: result.questions || [],
      storyboard: result.storyboard,
      summary: summarize(result.storyboard, result.warnings),
      changedShotIds: extra.changedShotIds || [],
    });
  }, [addMessage]);

  // A new draft or script replaces the board but keeps its characters.
  const draft = useCallback(({ brief, durationSeconds, attachment }) => {
    const characters = boardCharacters(boardRef.current);
    return runAgent({
      replaceBoard: true,
      kind: "draft",
      userText: brief,
      attachment,
      request: (signal, onProgress) => draftVideoStoryboard({
        modelKey: latest.current.modelKey,
        brief,
        durationSeconds,
        hasStartFrame: latest.current.hasStartFrame,
        characters,
        signal,
        onProgress,
      }),
      onResult: (result, reasoning) => acceptResult(result, { reasoning }),
    });
  }, [acceptResult, runAgent]);

  const fromScript = useCallback(({ script, attachment }) => {
    const characters = boardCharacters(boardRef.current);
    return runAgent({
      replaceBoard: true,
      kind: "script",
      userText: script,
      attachment,
      request: (signal, onProgress) => scriptToVideoStoryboard({
        modelKey: latest.current.modelKey,
        script,
        hasStartFrame: latest.current.hasStartFrame,
        characters,
        signal,
        onProgress,
      }),
      onResult: (result, reasoning) => acceptResult(result, { reasoning }),
    });
  }, [acceptResult, runAgent]);

  const importScript = useCallback(({ file, attachment }) => {
    const characters = boardCharacters(boardRef.current);
    return runAgent({
      replaceBoard: true,
      kind: "script",
      userText: `匯入腳本文件：${file.name}`,
      attachment,
      request: async (signal, onProgress) => {
        if (!SCRIPT_DOCUMENT_EXTENSIONS.includes(getDocumentExtension(file.name))) {
          throw new Error("腳本文件只支援 DOCX、TXT、MD");
        }
        if (file.size > MAX_DOCUMENT_FILE_SIZE) throw new Error("腳本文件必須小於 50MB");
        const { uploadId } = await uploadFile(file, "document");
        if (!uploadId) throw new Error("腳本文件上傳失敗");
        return scriptToVideoStoryboard({
          modelKey: latest.current.modelKey,
          uploadId,
          hasStartFrame: latest.current.hasStartFrame,
          characters,
          signal,
          onProgress,
        });
      },
      onResult: (result, reasoning) => {
        setPreviews((current) => ({ ...current, ...result.referencePreviews }));
        acceptResult(result, { reasoning });
      },
    });
  }, [acceptResult, runAgent]);

  const revise = useCallback(({ instruction, shotId = null, label }) => {
    if (!board) return Promise.resolve();
    return runAgent({
      kind: shotId ? `revise:${shotId}` : "revise",
      userText: label || instruction,
      request: (signal, onProgress) => reviseVideoStoryboard({
        modelKey: latest.current.modelKey,
        storyboard: board.storyboard,
        instruction,
        shotId,
        hasStartFrame: latest.current.hasStartFrame,
        signal,
        onProgress,
      }),
      onResult: (result, reasoning) => acceptResult(result, {
        reasoning,
        changedShotIds: result.changedShotIds,
        keepNotes: true,
      }),
    });
  }, [acceptResult, board, runAgent]);

  const edit = useCallback((updater, shotId = null) => {
    const current = boardRef.current;
    if (!current) return;
    const storyboard = updater(current.storyboard);
    const next = {
      ...current,
      storyboard,
      changedShotIds: shotId
        ? current.changedShotIds.filter((id) => id !== shotId)
        : current.changedShotIds,
    };
    boardRef.current = next;
    setBoard(next);
    scheduleInspect(storyboard);
  }, [scheduleInspect]);

  const open = useCallback((storyboard, { reopened = true } = {}) => {
    agentController.current?.abort();
    setBoard((current) => ({
      revision: (current?.revision ?? 0) + 1,
      storyboard,
      warnings: [],
      segments: null,
      shotNotes: {},
      changedShotIds: [],
      reopened,
    }));
    scheduleInspect(storyboard);
  }, [scheduleInspect]);

  const uploadImage = useCallback(async (file) => {
    if (file.size > MAX_CHARACTER_IMAGE_BYTES) throw new Error("角色參考圖必須小於 10MB");
    const [{ uploadId }, dataUrl] = await Promise.all([uploadFile(file, "image"), readFileAsDataUrl(file)]);
    if (!uploadId) throw new Error("角色參考圖上傳失敗");
    const id = uploadId.toLowerCase();
    setPreviews((current) => ({ ...current, [id]: dataUrl }));
    return id;
  }, []);

  const close = useCallback(() => {
    agentController.current?.abort();
    inspectController.current?.abort();
    clearTimeout(inspectTimer.current);
    setBoard(null);
    setInspection({ status: "idle", error: "", config: "" });
  }, []);

  const currentInspection = board && inspection.status !== "loading" && inspection.config !== config
    ? { status: "loading", error: "", config }
    : inspection;

  return {
    board,
    messages,
    pending,
    progress,
    inspection: currentInspection,
    hasStartFrame,
    previews,
    uploadImage,
    draft,
    fromScript,
    importScript,
    revise,
    edit,
    open,
    close,
  };
}
