import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as chatApi from "../services/imageChatService";
import { waitForImageJob } from "../services/aiService";
import { buildVersionRows } from "./useImageVersions";

const SAVE_DELAY_MS = 800;
const TITLE_CHARS = 40;

const isAbort = (error) => error?.name === "AbortError";

const toSummary = (chat) => ({ id: chat.id, title: chat.title, updatedAt: chat.updatedAt });

const replaceTurnMessage = (messages, turnId, role, next) =>
  messages.map((message) =>
    message.turnId === turnId && message.role === role ? { ...message, ...next } : message
  );

const lastUserStyle = (messages) => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === "user") return messages[index].input?.style || null;
  }
  return null;
};

/**
 * Chat-to-image state: the chat list, the open chat with its messages, the
 * composer snapshot that is saved back to the server, and the reply stream.
 * Every async result is keyed by chatId so switching chats never writes an
 * old reply or image into the chat on screen.
 */
export default function useImageChat({ enabled, initialSettings }) {
  const [chats, setChats] = useState([]);
  const [chatsCursor, setChatsCursor] = useState(null);
  const [isLoadingChats, setIsLoadingChats] = useState(false);
  const [chat, setChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [nextBefore, setNextBefore] = useState(null);
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [draft, setDraftState] = useState("");
  const [settings, setSettingsState] = useState(initialSettings);
  const [selectedJobId, setSelectedJobIdState] = useState(null);
  const [style, setStyle] = useState(null);
  const [attachment, setAttachment] = useState(null);
  const [saveStatus, setSaveStatus] = useState("saved");
  const [sending, setSending] = useState(null);
  const [error, setError] = useState("");

  const activeChatIdRef = useRef(null);
  const chatRef = useRef(null);
  const stateRef = useRef({ draft, settings, selectedJobId });
  const dirtyRef = useRef(false);
  const saveTimerRef = useRef(null);
  const savingRef = useRef(null);
  const jobWatchersRef = useRef(new Map());
  const streamRef = useRef(null);
  const loadRef = useRef(null);
  const chatsLoadedRef = useRef(false);

  useEffect(() => {
    chatRef.current = chat;
  }, [chat]);
  useEffect(() => {
    stateRef.current = { draft, settings, selectedJobId };
  }, [draft, settings, selectedJobId]);

  const updateChatMessages = useCallback((chatId, update) => {
    if (activeChatIdRef.current === chatId) setMessages(update);
  }, []);

  const stopWatchingJobs = useCallback(() => {
    for (const controller of jobWatchersRef.current.values()) controller.abort();
    jobWatchersRef.current.clear();
  }, []);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    setSaveStatus("pending");
  }, []);

  const setDraft = useCallback((value) => {
    setDraftState(value);
    markDirty();
  }, [markDirty]);

  const updateSettings = useCallback((patch) => {
    setSettingsState((current) => ({ ...current, ...patch }));
    markDirty();
  }, [markDirty]);

  const selectVersion = useCallback((jobId) => {
    setSelectedJobIdState(jobId);
    markDirty();
  }, [markDirty]);

  const adoptChat = useCallback((next) => {
    setChat(next);
    setDraftState(next.draft);
    setSettingsState(next.settings);
    setSelectedJobIdState(next.selectedJobId);
    dirtyRef.current = false;
    setSaveStatus("saved");
  }, []);

  const watchJob = useCallback((chatId, jobId) => {
    if (!jobId || jobWatchersRef.current.has(jobId)) return;
    const controller = new AbortController();
    jobWatchersRef.current.set(jobId, controller);
    const settle = (next) =>
      updateChatMessages(chatId, (current) =>
        current.map((message) => (message.imageJobId === jobId ? { ...message, ...next } : message))
      );

    waitForImageJob({ jobId, signal: controller.signal })
      .then(() => {
        settle({ status: "completed", imageUrl: chatApi.imageJobImageUrl(jobId), error: null });
        if (activeChatIdRef.current === chatId) {
          setSelectedJobIdState(jobId);
          markDirty();
        }
      })
      .catch((err) => {
        if (isAbort(err)) return;
        settle({
          status: "failed",
          error: { code: "image_failed", message: err.message || "圖片生成失敗，請稍後重試" },
        });
      })
      .finally(() => {
        if (jobWatchersRef.current.get(jobId) === controller) jobWatchersRef.current.delete(jobId);
      });
  }, [updateChatMessages, markDirty]);

  const showChat = useCallback((data) => {
    activeChatIdRef.current = data.chat.id;
    adoptChat(data.chat);
    setMessages(data.messages);
    setNextBefore(data.nextBefore);
    setStyle(lastUserStyle(data.messages));
    setAttachment(null);
    for (const message of data.messages) {
      if (message.status === "image_pending") watchJob(data.chat.id, message.imageJobId);
    }
  }, [adoptChat, watchJob]);

  const saveNow = useCallback(async () => {
    clearTimeout(saveTimerRef.current);
    if (savingRef.current) await savingRef.current;
    const current = chatRef.current;
    if (!current || !dirtyRef.current) return;

    dirtyRef.current = false;
    setSaveStatus("saving");
    const { draft: savedDraft, settings: savedSettings, selectedJobId: savedJobId } = stateRef.current;
    const request = chatApi
      .saveChatState({
        chatId: current.id,
        stateVersion: current.stateVersion,
        draft: savedDraft,
        settings: savedSettings,
        selectedJobId: savedJobId,
      })
      .then((saved) => {
        if (activeChatIdRef.current !== saved.id) return;
        setChat(saved);
        chatRef.current = saved;
        setSaveStatus(dirtyRef.current ? "pending" : "saved");
      })
      .catch(async (err) => {
        if (activeChatIdRef.current !== current.id) return;
        if (err.code === "state_conflict") {
          try {
            const latest = await chatApi.getChat({ chatId: current.id });
            if (activeChatIdRef.current !== current.id) return;
            showChat(latest);
            setError("這段對話已在其他視窗更新，已載入最新內容。");
          } catch (reloadErr) {
            setSaveStatus("error");
            setError(reloadErr.message || "無法重新載入對話");
          }
          return;
        }
        dirtyRef.current = true;
        setSaveStatus("error");
        setError(err.message || "對話草稿與設定未儲存");
      })
      .finally(() => {
        savingRef.current = null;
      });
    savingRef.current = request;
    await request;
  }, [showChat]);

  useEffect(() => {
    if (!chat || !dirtyRef.current || saveStatus !== "pending") return undefined;
    saveTimerRef.current = setTimeout(() => {
      void saveNow();
    }, SAVE_DELAY_MS);
    return () => clearTimeout(saveTimerRef.current);
  }, [chat, draft, settings, selectedJobId, saveStatus, saveNow]);

  const loadChats = useCallback(async ({ more = false } = {}) => {
    setIsLoadingChats(true);
    try {
      const page = await chatApi.listChats({ cursor: more ? chatsCursor : undefined });
      setChats((current) => (more ? [...current, ...page.items] : page.items));
      setChatsCursor(page.nextCursor);
    } catch (err) {
      setError(err.message || "無法載入對話紀錄");
    } finally {
      setIsLoadingChats(false);
    }
  }, [chatsCursor]);

  useEffect(() => {
    if (!enabled || chatsLoadedRef.current) return;
    chatsLoadedRef.current = true;
    void loadChats();
  }, [enabled, loadChats]);

  const leaveChat = useCallback(async () => {
    await saveNow();
    loadRef.current?.abort();
    stopWatchingJobs();
  }, [saveNow, stopWatchingJobs]);

  const openChat = useCallback(async (chatId) => {
    if (chatId === activeChatIdRef.current) return;
    await leaveChat();
    const controller = new AbortController();
    loadRef.current = controller;
    activeChatIdRef.current = chatId;
    setIsLoadingChat(true);
    setError("");
    try {
      showChat(await chatApi.getChat({ chatId, signal: controller.signal }));
    } catch (err) {
      if (isAbort(err)) return;
      setError(err.message || "無法開啟對話");
    } finally {
      if (loadRef.current === controller) setIsLoadingChat(false);
    }
  }, [leaveChat, showChat]);

  const startNewChat = useCallback(async () => {
    await leaveChat();
    activeChatIdRef.current = null;
    setChat(null);
    setMessages([]);
    setNextBefore(null);
    setDraftState("");
    setSelectedJobIdState(null);
    setStyle(null);
    setAttachment(null);
    dirtyRef.current = false;
    setSaveStatus("saved");
    setError("");
  }, [leaveChat]);

  const loadOlderMessages = useCallback(async () => {
    const chatId = activeChatIdRef.current;
    if (!chatId || nextBefore === null) return;
    try {
      const page = await chatApi.listMessages({ chatId, before: nextBefore });
      if (activeChatIdRef.current !== chatId) return;
      setMessages((current) => [...page.items, ...current]);
      setNextBefore(page.nextBefore);
    } catch (err) {
      setError(err.message || "無法載入較早的訊息");
    }
  }, [nextBefore]);

  const removeChat = useCallback(async (chatId) => {
    try {
      await chatApi.deleteChat({ chatId });
      setChats((current) => current.filter((item) => item.id !== chatId));
      if (activeChatIdRef.current === chatId) {
        dirtyRef.current = false;
        await startNewChat();
      }
    } catch (err) {
      setError(err.message || "無法刪除對話");
    }
  }, [startNewChat]);

  const handleEvent = useCallback((chatId, turnId, { type, data }) => {
    if (type === "turn") {
      updateChatMessages(chatId, (current) =>
        replaceTurnMessage(
          replaceTurnMessage(current, turnId, "user", data.userMessage),
          turnId,
          "assistant",
          data.assistantMessage
        )
      );
    } else if (type === "delta") {
      setSending((current) => (current?.turnId === turnId ? { ...current, phase: "streaming" } : current));
      updateChatMessages(chatId, (current) =>
        current.map((message) =>
          message.turnId === turnId && message.role === "assistant"
            ? { ...message, content: `${message.content}${data.text}` }
            : message
        )
      );
    } else if (type === "action") {
      updateChatMessages(chatId, (current) =>
        replaceTurnMessage(current, turnId, "assistant", {
          action: data.action,
          imageJobId: data.jobId,
          sourceJobId: data.sourceJobId,
          status: "image_pending",
        })
      );
      if (activeChatIdRef.current === chatId) watchJob(chatId, data.jobId);
    } else if (type === "error") {
      updateChatMessages(chatId, (current) =>
        replaceTurnMessage(current, turnId, "assistant", { error: { code: data.code, message: data.message } })
      );
    } else if (type === "done") {
      updateChatMessages(chatId, (current) => replaceTurnMessage(current, turnId, "assistant", data.message));
      if (data.message.status === "image_pending" && activeChatIdRef.current === chatId) {
        watchJob(chatId, data.message.imageJobId);
      }
    }
  }, [updateChatMessages, watchJob]);

  const send = useCallback(async (content) => {
    const text = content.trim();
    if (!text || sending) return false;
    setError("");

    let chatId = activeChatIdRef.current;
    const snapshot = { settings, style, attachment, selectedJobId };
    const turnId = crypto.randomUUID();
    setSending({ chatId, turnId, phase: "submitted" });

    try {
      if (!chatId) {
        const created = await chatApi.createChat({ settings });
        activeChatIdRef.current = created.id;
        chatId = created.id;
        setChat(created);
        chatRef.current = created;
        setChats((current) => [toSummary(created), ...current]);
        setSending({ chatId, turnId, phase: "submitted" });
      }
    } catch (err) {
      setSending(null);
      setError(err.message || "無法建立對話");
      return false;
    }

    const userInput = {
      settings: snapshot.settings,
      style: snapshot.style,
      attachmentUploadId: snapshot.attachment?.uploadId || null,
      sourceJobId: snapshot.selectedJobId,
    };
    setMessages((current) => [
      ...current,
      { id: `local-user-${turnId}`, turnId, role: "user", content: text, input: userInput, status: "completed", error: null },
      { id: `local-assistant-${turnId}`, turnId, role: "assistant", content: "", action: "none", status: "responding", error: null },
    ]);
    setDraftState("");
    markDirty();

    const controller = new AbortController();
    streamRef.current = controller;
    let admitted = false;
    try {
      await chatApi.sendChatMessage({
        chatId,
        signal: controller.signal,
        body: {
          clientMessageId: turnId,
          content: text,
          settings: snapshot.settings,
          style: snapshot.style,
          attachmentUploadId: userInput.attachmentUploadId,
          sourceJobId: snapshot.selectedJobId,
        },
        onEvent: (event) => {
          if (event.type === "turn") {
            admitted = true;
            setAttachment(null);
            setChats((current) => {
              const existing = current.find((item) => item.id === chatId);
              const summary = {
                id: chatId,
                title: existing?.title || text.slice(0, TITLE_CHARS),
                updatedAt: new Date().toISOString(),
              };
              return [summary, ...current.filter((item) => item.id !== chatId)];
            });
          }
          handleEvent(chatId, turnId, event);
        },
      });
      return true;
    } catch (err) {
      if (isAbort(err)) return false;
      if (!admitted) {
        updateChatMessages(chatId, (current) => current.filter((message) => message.turnId !== turnId));
        if (activeChatIdRef.current === chatId) {
          setDraftState(text);
          markDirty();
        }
        setError(err.message || "訊息送出失敗");
        return false;
      }
      setError(err.message || "回覆連線中斷，請重新整理對話確認狀態");
      if (activeChatIdRef.current === chatId) {
        try {
          showChat(await chatApi.getChat({ chatId }));
        } catch (reloadErr) {
          setError(reloadErr.message || "無法重新載入對話");
        }
      }
      return false;
    } finally {
      if (streamRef.current === controller) streamRef.current = null;
      setSending((current) => (current?.turnId === turnId ? null : current));
    }
  }, [sending, settings, style, attachment, selectedJobId, handleEvent, updateChatMessages, showChat, markDirty]);

  const stopReply = useCallback(async () => {
    if (!sending?.chatId) return;
    try {
      await chatApi.stopTurn({ chatId: sending.chatId, turnId: sending.turnId });
    } catch (err) {
      setError(err.message || "無法停止回覆");
    }
  }, [sending]);

  useEffect(() => () => {
    streamRef.current?.abort();
    loadRef.current?.abort();
    clearTimeout(saveTimerRef.current);
    stopWatchingJobs();
  }, [stopWatchingJobs]);

  const versions = useMemo(() => {
    const images = messages.filter(
      (message) => message.role === "assistant" && message.imageJobId && message.imageUrl
    );
    const ids = new Set(images.map((message) => message.imageJobId));
    return images.map((message) => ({
      id: message.imageJobId,
      jobId: message.imageJobId,
      imageUrl: chatApi.imageJobImageUrl(message.imageJobId),
      instruction: message.content,
      parentId: ids.has(message.sourceJobId) ? message.sourceJobId : null,
    }));
  }, [messages]);
  const versionRows = useMemo(() => buildVersionRows(versions), [versions]);
  const getVersion = useCallback((id) => versions.find((version) => version.id === id) || null, [versions]);
  const getVersionLabel = useCallback(
    (version) => `v${versions.findIndex((item) => item.id === version?.id) + 1}`,
    [versions]
  );
  const selectedVersion = getVersion(selectedJobId);
  const pendingImage = messages.findLast((message) => message.status === "image_pending") || null;

  return {
    chats,
    hasMoreChats: Boolean(chatsCursor),
    isLoadingChats,
    loadMoreChats: () => loadChats({ more: true }),
    chat,
    messages,
    hasOlderMessages: nextBefore !== null,
    loadOlderMessages,
    isLoadingChat,
    openChat,
    startNewChat,
    removeChat,
    draft,
    setDraft,
    settings,
    updateSettings,
    style,
    setStyle,
    attachment,
    setAttachment,
    saveStatus,
    sending,
    send,
    stopReply,
    error,
    clearError: () => setError(""),
    versions,
    versionRows,
    getVersion,
    getVersionLabel,
    selectedJobId,
    selectedVersion,
    selectVersion,
    pendingImage,
  };
}
