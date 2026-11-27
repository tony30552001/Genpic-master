import { useCallback, useEffect, useRef, useState } from "react";
import {
  draftVideoStoryboard,
  generateImage,
  inspectVideoStoryboard,
  reviseVideoStoryboard,
  scriptToVideoStoryboard,
  waitForImageJob,
  waitForStoryboardJob,
} from "../services/aiService";
import { uploadFile } from "../services/storageService";
import { imageUrlToFile, readFileAsDataUrl } from "../lib/imageFile";
import { requireCompletedImageJob } from "../lib/imageJob";
import { MAX_DOCUMENT_FILE_SIZE, getDocumentExtension } from "../lib/documentFormats";
import {
  MAX_CHARACTER_IMAGE_BYTES,
  MIN_CHARACTER_IMAGES,
  SCRIPT_DOCUMENT_EXTENSIONS,
  SOURCE_DOCUMENT_EXTENSIONS,
  canHaveStartFrame,
  storyboardSeconds,
} from "../lib/videoStoryboard";

const INSPECT_DELAY_MS = 400;

const makeId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;

const boardCharacters = (board) => board?.storyboard.global.characters || [];

const missingAngle = (characters) => {
  const character = characters.find((item) => item.uploadIds.length < MIN_CHARACTER_IMAGES);
  return character ? `請在全片設定為「${character.name}」再加入一張不同角度的參考圖` : "";
};

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
 * kept on the storyboard message it produced. `pendingJob` is the running
 * agent job; a session restored with `initial.pendingAgent` waits for it again.
 * A board opened from a generated video keeps that video's `baseProjectId`
 * through revisions, so generating it again reuses the unchanged segments.
 */
export default function useVideoStoryboard({ modelKey, hasStartFrame, initial = null }) {
  const [board, setBoard] = useState(() =>
    initial?.board ? { revision: 1, warnings: [], segments: null, ...initial.board } : null
  );
  const [messages, setMessages] = useState(() => initial?.messages || []);
  const [resumeJob] = useState(() => initial?.pendingAgent || null);
  const [pending, setPending] = useState(() => resumeJob?.kind || null);
  const [pendingJob, setPendingJob] = useState(resumeJob);
  const [progress, setProgress] = useState(null);
  const [inspection, setInspection] = useState(() => ({
    status: initial?.board ? "loading" : "idle",
    error: "",
    config: `${modelKey}|${hasStartFrame}`,
  }));
  const [previews, setPreviews] = useState({});
  const [frame, setFrame] = useState(null);
  const frameController = useRef(null);
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
    frameController.current?.abort();
    inspectController.current?.abort();
    clearTimeout(inspectTimer.current);
  }, []);

  const resetFrame = useCallback(() => {
    frameController.current?.abort();
    frameController.current = null;
    setFrame(null);
  }, []);

  const inspect = useCallback(async (storyboard) => {
    inspectController.current?.abort();
    const controller = new AbortController();
    inspectController.current = controller;
    const inspectedConfig = `${latest.current.modelKey}|${latest.current.hasStartFrame}`;
    setInspection({ status: "loading", error: "", config: inspectedConfig });
    const error = missingAngle(storyboard.global.characters);
    if (error) {
      setBoard((current) => current && { ...current, segments: null });
      setInspection({ status: "invalid", error, config: inspectedConfig });
      return;
    }
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

  // Waits for one agent request; `runAgent` starts it, a restored session resumes it.
  const awaitAgent = useCallback(async (controller, { kind, request, onResult }) => {
    let reasoning = "";
    const onProgress = (snapshot) => {
      if (controller.signal.aborted) return;
      reasoning = snapshot?.reasoning || reasoning;
      setProgress(snapshot);
    };
    const onJob = (jobId) => {
      if (!controller.signal.aborted) setPendingJob({ jobId, kind });
    };
    try {
      const result = await request(controller.signal, onProgress, onJob);
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
        setPendingJob(null);
        setProgress(null);
      }
    }
  }, [addMessage]);

  const runAgent = useCallback(({ kind, userText, attachment, request, onResult, replaceBoard = false }) => {
    const error = missingAngle(boardCharacters(boardRef.current));
    if (error) {
      addMessage({ role: "assistant", kind: "error", text: error });
      return Promise.resolve();
    }
    resetFrame();
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
    setPendingJob(null);
    setProgress(null);
    return awaitAgent(controller, { kind, request, onResult });
  }, [addMessage, awaitAgent, resetFrame]);

  const acceptResult = useCallback((result, extra) => {
    setBoard((current) => ({
      revision: (current?.revision ?? 0) + 1,
      storyboard: result.storyboard,
      warnings: result.warnings,
      segments: result.segments,
      shotNotes: result.shotNotes ?? (extra.keepNotes ? current?.shotNotes : {}) ?? {},
      changedShotIds: extra.changedShotIds || [],
      reopened: extra.keepNotes ? Boolean(current?.reopened) : false,
      baseProjectId: extra.keepNotes ? current?.baseProjectId || null : null,
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

  // Script imports may carry reference images; revisions keep shot notes.
  const applyResult = useCallback((kind, result, reasoning) => {
    if (result.referencePreviews) setPreviews((current) => ({ ...current, ...result.referencePreviews }));
    if (kind.startsWith("revise")) {
      acceptResult(result, { reasoning, changedShotIds: result.changedShotIds, keepNotes: true });
    } else {
      acceptResult(result, { reasoning });
    }
  }, [acceptResult]);

  const startAgent = useCallback((options) => runAgent({
    ...options,
    onResult: (result, reasoning) => applyResult(options.kind, result, reasoning),
  }), [applyResult, runAgent]);

  // A new draft or script replaces the board but keeps its characters.
  const draft = useCallback(({ brief, durationSeconds, attachment }) => {
    const characters = boardCharacters(boardRef.current);
    return startAgent({
      replaceBoard: true,
      kind: "draft",
      userText: brief,
      attachment,
      request: (signal, onProgress, onJob) => draftVideoStoryboard({
        modelKey: latest.current.modelKey,
        brief,
        durationSeconds,
        hasStartFrame: latest.current.hasStartFrame,
        characters,
        signal,
        onProgress,
        onJob,
      }),
    });
  }, [startAgent]);

  const fromScript = useCallback(({ script, attachment }) => {
    const characters = boardCharacters(boardRef.current);
    return startAgent({
      replaceBoard: true,
      kind: "script",
      userText: script,
      attachment,
      request: (signal, onProgress, onJob) => scriptToVideoStoryboard({
        modelKey: latest.current.modelKey,
        script,
        hasStartFrame: latest.current.hasStartFrame,
        characters,
        signal,
        onProgress,
        onJob,
      }),
    });
  }, [startAgent]);

  const importScript = useCallback(({ file, attachment }) => {
    const characters = boardCharacters(boardRef.current);
    return startAgent({
      replaceBoard: true,
      kind: "script",
      userText: `匯入腳本文件：${file.name}`,
      attachment,
      request: async (signal, onProgress, onJob) => {
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
          onJob,
        });
      },
    });
  }, [startAgent]);

  // The AI adapts a document such as an SOP into shots; `brief` adds optional
  // instructions (audience, tone, focus).
  const draftFromDocument = useCallback(({ file, brief, durationSeconds, attachment }) => {
    const characters = boardCharacters(boardRef.current);
    return startAgent({
      replaceBoard: true,
      kind: "draft",
      userText: [`依文件發想分鏡：${file.name}`, brief].filter(Boolean).join("\n"),
      attachment,
      request: async (signal, onProgress, onJob) => {
        if (!SOURCE_DOCUMENT_EXTENSIONS.includes(getDocumentExtension(file.name))) {
          throw new Error("文件只支援 DOCX、TXT、MD、PDF");
        }
        if (file.size > MAX_DOCUMENT_FILE_SIZE) throw new Error("文件必須小於 50MB");
        const { uploadId } = await uploadFile(file, "document");
        if (!uploadId) throw new Error("文件上傳失敗");
        return draftVideoStoryboard({
          modelKey: latest.current.modelKey,
          brief,
          uploadId,
          durationSeconds,
          hasStartFrame: latest.current.hasStartFrame,
          characters,
          signal,
          onProgress,
          onJob,
        });
      },
    });
  }, [startAgent]);

  const revise = useCallback(({ instruction, shotIds = null, label }) => {
    if (!board) return Promise.resolve();
    return startAgent({
      kind: shotIds ? `revise:${shotIds.join(",")}` : "revise",
      userText: label || instruction,
      request: (signal, onProgress, onJob) => reviseVideoStoryboard({
        modelKey: latest.current.modelKey,
        storyboard: board.storyboard,
        instruction,
        shotIds,
        hasStartFrame: latest.current.hasStartFrame,
        signal,
        onProgress,
        onJob,
      }),
    });
  }, [board, startAgent]);

  // A restored session waits again for the agent job it was saved with.
  useEffect(() => {
    if (!resumeJob) return undefined;
    const controller = new AbortController();
    agentController.current = controller;
    void awaitAgent(controller, {
      kind: resumeJob.kind,
      request: (signal, onProgress) => waitForStoryboardJob({ jobId: resumeJob.jobId, signal, onProgress }),
      onResult: (result, reasoning) => applyResult(resumeJob.kind, result, reasoning),
    });
    return () => controller.abort();
  }, [applyResult, awaitAgent, resumeJob]);
  const edit = useCallback((updater, shotId = null) => {
    const current = boardRef.current;
    if (!current) return;
    const storyboard = updater(current.storyboard);
    const next = {
      ...current,
      storyboard,
      segments: current.storyboard.shots.length !== storyboard.shots.length
        || storyboard.shots.some((shot, index) => current.storyboard.shots[index].id !== shot.id)
        ? null : current.segments,
      changedShotIds: shotId
        ? current.changedShotIds.filter((id) => id !== shotId)
        : current.changedShotIds,
    };
    boardRef.current = next;
    setBoard(next);
    scheduleInspect(storyboard);
  }, [scheduleInspect]);

  const open = useCallback((storyboard, { reopened = true, baseProjectId = null } = {}) => {
    resetFrame();
    agentController.current?.abort();
    setBoard((current) => ({
      revision: (current?.revision ?? 0) + 1,
      storyboard,
      warnings: [],
      segments: null,
      shotNotes: {},
      changedShotIds: [],
      reopened,
      baseProjectId,
    }));
    scheduleInspect(storyboard);
  }, [resetFrame, scheduleInspect]);

  const generateFrame = useCallback(async (shotId, referenceUploadId) => {
    const initial = boardRef.current?.storyboard;
    const shot = initial?.shots.find((item) => item.id === shotId);
    const eligible = () => {
      const shots = boardRef.current?.storyboard.shots || [];
      const index = shots.findIndex((item) => item.id === shotId);
      return index >= 0 && shots[index] === shot && canHaveStartFrame(shot, index)
        && !(index === 0 && latest.current.hasStartFrame);
    };
    if (frameController.current || agentController.current || !shot?.references.some((item) => item.uploadId === referenceUploadId) || !eligible()) return;
    const controller = new AbortController();
    const { signal } = controller;
    frameController.current = controller;
    const target = { shotId, referenceUploadId };
    setFrame({ ...target, pending: true });
    try {
      const { jobId, model } = await generateImage({
        referenceUploadId,
        userScript: `依照參考圖與這幕內容，繪製影片開始瞬間的單一完整畫面。保留主體外觀，移除拼貼、格線、標註、字幕與箭頭，不要加入任何文字。\n分鏡：${shot.script || shot.action}`,
        stylePrompt: [initial.global.style, initial.global.lighting, shot.environment].filter(Boolean).join("。"),
        purpose: "freeform", imageLanguage: "none", aspectRatio: "16:9", signal,
      });
      const { imageUrl } = requireCompletedImageJob(await waitForImageJob({ jobId, signal }), { jobId, model, operation: "edit" });
      const checkTarget = () => {
        signal.throwIfAborted();
        if (!eligible()) throw new Error("分鏡或首影格已變更，未套用產生的圖片");
      };
      checkTarget();
      const file = await imageUrlToFile(imageUrl, `storyboard-frame-${shotId}`);
      checkTarget();
      const { uploadId } = await uploadFile(file, "image");
      checkTarget();
      if (!uploadId) throw new Error("首影格上傳失敗");
      setPreviews((current) => ({ ...current, [uploadId]: imageUrl }));
      edit((current) => ({ ...current, shots: current.shots.map((item) => item.id === shotId ? { ...item, startFrameUploadId: uploadId } : item) }), shotId);
      setFrame(null);
    } catch (error) {
      if (!signal.aborted) setFrame({ ...target, error: error.message || "產生首影格失敗" });
    } finally {
      if (frameController.current === controller) frameController.current = null;
    }
  }, [edit]);

  const uploadImage = useCallback(async (file) => {
    if (file.size > MAX_CHARACTER_IMAGE_BYTES) throw new Error("角色參考圖必須小於 10MB");
    const [{ uploadId }, dataUrl] = await Promise.all([uploadFile(file, "image"), readFileAsDataUrl(file)]);
    if (!uploadId) throw new Error("角色參考圖上傳失敗");
    const id = uploadId.toLowerCase();
    setPreviews((current) => ({ ...current, [id]: dataUrl }));
    return id;
  }, []);

  const close = useCallback(() => {
    resetFrame();
    agentController.current?.abort();
    inspectController.current?.abort();
    clearTimeout(inspectTimer.current);
    setBoard(null);
    setInspection({ status: "idle", error: "", config: "" });
  }, [resetFrame]);

  const currentInspection = board && inspection.status !== "loading" && inspection.config !== config
    ? { status: "loading", error: "", config }
    : inspection;

  return {
    board,
    messages,
    pending: frame?.pending ? "frame" : pending,
    pendingJob,
    progress,
    inspection: currentInspection,
    hasStartFrame,
    previews,
    frame,
    generateFrame,
    uploadImage,
    draft,
    draftFromDocument,
    fromScript,
    importScript,
    revise,
    edit,
    open,
    close,
  };
}
