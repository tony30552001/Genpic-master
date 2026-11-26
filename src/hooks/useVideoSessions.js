import { useCallback, useEffect, useRef, useState } from "react";
import * as sessionApi from "../services/videoSessionService";

const SAVE_DELAY_MS = 1000;

const newSlot = (session = null) => ({
  id: session?.id || null,
  stateVersion: session?.stateVersion || null,
  snapshot: session ? { title: session.title, state: session.state } : null,
  savedJson: session ? JSON.stringify({ title: session.title, state: session.state }) : null,
  saving: null,
  timer: null,
  stale: false,
});

const isEmpty = (state) => !state.messages?.length && !state.turns?.length;

/**
 * Persists the open video creation as a session. The workspace reports every
 * change as a `{ title, state }` snapshot; the first non-empty snapshot creates
 * the session and later ones replace it, debounced and one request at a time.
 * Each session has its own save slot, so starting or opening another creation
 * still finishes saving the previous one. `workspaceKey` changes only when a
 * different creation is shown, so the workspace remounts and hydrates from
 * `getInitialState()`.
 */
export default function useVideoSessions({ enabled }) {
  const [items, setItems] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const [title, setTitle] = useState("");
  const [saveStatus, setSaveStatus] = useState("saved");
  const [error, setError] = useState("");
  const [workspaceKey, setWorkspaceKey] = useState(0);
  const slotRef = useRef(newSlot());
  const cursorRef = useRef(null);
  const loadedRef = useRef(false);

  const upsert = useCallback((summary) => {
    setItems((current) => [summary, ...current.filter((item) => item.id !== summary.id)]);
  }, []);

  const saveSlot = useCallback(async (slot) => {
    clearTimeout(slot.timer);
    while (slot.saving) await slot.saving;
    const snapshot = slot.snapshot;
    if (!snapshot || slot.stale || (!slot.id && isEmpty(snapshot.state))) return;
    const json = JSON.stringify(snapshot);
    if (json === slot.savedJson) return;
    const isActive = () => slotRef.current === slot;
    if (isActive()) setSaveStatus("saving");
    const run = (async () => {
      try {
        const saved = slot.id
          ? await sessionApi.saveVideoSession({ sessionId: slot.id, stateVersion: slot.stateVersion, ...snapshot })
          : await sessionApi.createVideoSession(snapshot);
        slot.id = saved.id;
        slot.stateVersion = saved.stateVersion;
        slot.savedJson = json;
        upsert({ id: saved.id, title: saved.title, updatedAt: saved.updatedAt });
        if (isActive()) {
          setActiveId(saved.id);
          setSaveStatus(slot.snapshot === snapshot ? "saved" : "pending");
          setError("");
        }
      } catch (err) {
        slot.stale = err.code === "state_conflict";
        if (isActive()) {
          setSaveStatus("error");
          setError(slot.stale
            ? "這段創作已在其他視窗更新，請從創作紀錄重新開啟。"
            : err.message || "創作紀錄未儲存");
        }
      }
    })();
    slot.saving = run;
    await run;
    slot.saving = null;
  }, [upsert]);

  const record = useCallback((snapshot) => {
    const slot = slotRef.current;
    slot.snapshot = snapshot;
    setTitle(snapshot.title);
    if ((!slot.id && isEmpty(snapshot.state)) || slot.stale) return;
    if (JSON.stringify(snapshot) === slot.savedJson) {
      if (!slot.saving) {
        clearTimeout(slot.timer);
        setSaveStatus("saved");
      }
      return;
    }
    setSaveStatus("pending");
    clearTimeout(slot.timer);
    slot.timer = setTimeout(() => void saveSlot(slot), SAVE_DELAY_MS);
  }, [saveSlot]);

  const show = useCallback((session) => {
    void saveSlot(slotRef.current);
    slotRef.current = newSlot(session);
    setActiveId(session?.id || null);
    setTitle(session?.title || "");
    setSaveStatus("saved");
    setError("");
    setWorkspaceKey((key) => key + 1);
  }, [saveSlot]);

  const startNew = useCallback(() => show(null), [show]);

  const open = useCallback(async (sessionId) => {
    if (sessionId === slotRef.current.id) return;
    setIsOpening(true);
    setError("");
    try {
      show(await sessionApi.getVideoSession({ sessionId }));
    } catch (err) {
      setError(err.message || "無法開啟創作紀錄");
    } finally {
      setIsOpening(false);
    }
  }, [show]);

  const remove = useCallback(async (sessionId) => {
    const slot = slotRef.current;
    const isActive = slot.id === sessionId;
    setError("");
    try {
      if (isActive) {
        clearTimeout(slot.timer);
        slot.stale = true;
        if (slot.saving) await slot.saving;
      }
      await sessionApi.deleteVideoSession({ sessionId });
      setItems((current) => current.filter((item) => item.id !== sessionId));
      if (isActive && slotRef.current === slot) show(null);
    } catch (err) {
      if (isActive) slot.stale = false;
      setError(err.message || "刪除創作紀錄失敗");
    }
  }, [show]);

  const loadSessions = useCallback(async ({ more = false } = {}) => {
    setIsLoading(true);
    try {
      const page = await sessionApi.listVideoSessions({ cursor: more ? cursorRef.current : undefined });
      setItems((current) => (more ? [...current, ...page.items] : page.items));
      cursorRef.current = page.nextCursor;
      setHasMore(Boolean(page.nextCursor));
    } catch (err) {
      setError(err.message || "無法載入創作紀錄");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled || loadedRef.current) return;
    loadedRef.current = true;
    void loadSessions();
  }, [enabled, loadSessions]);

  useEffect(() => {
    const slots = slotRef;
    return () => clearTimeout(slots.current.timer);
  }, []);

  const getInitialState = useCallback(() => slotRef.current.snapshot?.state || null, []);
  const loadMore = useCallback(() => loadSessions({ more: true }), [loadSessions]);

  return {
    items,
    hasMore,
    isLoading,
    isOpening,
    activeId,
    title,
    saveStatus,
    error,
    workspaceKey,
    getInitialState,
    record,
    startNew,
    open,
    remove,
    loadMore,
  };
}
