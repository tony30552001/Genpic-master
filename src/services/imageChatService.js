import { createParser } from "eventsource-parser";
import { API_BASE_URL } from "../config";
import { apiDelete, apiGet, apiPost, apiPostStream, apiPut } from "./apiClient";

const chatUrl = (chatId) => `${API_BASE_URL}/image-chats/${encodeURIComponent(chatId)}`;

export const imageJobImageUrl = (jobId) =>
  `${API_BASE_URL}/image-jobs/${encodeURIComponent(jobId)}/image`;

export const listChats = ({ cursor, signal } = {}) =>
  apiGet(
    `${API_BASE_URL}/image-chats${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    { signal }
  );

export const createChat = ({ settings }) => apiPost(`${API_BASE_URL}/image-chats`, { settings });

/** Returns `{ chat, messages, nextBefore }` with the newest page of messages. */
export const getChat = ({ chatId, signal }) => apiGet(chatUrl(chatId), { signal });

export const listMessages = ({ chatId, before, signal }) =>
  apiGet(`${chatUrl(chatId)}/messages?before=${encodeURIComponent(before)}`, { signal });

export const saveChatState = ({ chatId, stateVersion, draft, settings, selectedJobId }) =>
  apiPut(`${chatUrl(chatId)}/state`, { stateVersion, draft, settings, selectedJobId });

export const deleteChat = ({ chatId }) => apiDelete(chatUrl(chatId));

export const stopTurn = ({ chatId, turnId }) =>
  apiPost(`${chatUrl(chatId)}/turns/${encodeURIComponent(turnId)}/stop`, {});

/**
 * Sends one message and reports each server event (`turn`, `delta`, `action`,
 * `error`, `done`) through `onEvent`. Resolves when the stream ends. Never
 * resends: a lost stream is recovered by reloading the chat.
 */
export const sendChatMessage = async ({ chatId, body, signal, onEvent }) => {
  const response = await apiPostStream(`${chatUrl(chatId)}/messages`, body, { signal });
  if (!response?.body) throw new Error("瀏覽器不支援串流回應");

  let finished = false;
  const parser = createParser({
    onEvent: ({ event, data }) => {
      if (!event) return;
      const payload = JSON.parse(data);
      if (event === "done") finished = true;
      onEvent({ type: event, data: payload });
    },
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      parser.feed(decoder.decode(value, { stream: true }));
    }
    parser.feed(decoder.decode());
  } finally {
    reader.releaseLock();
  }

  if (!finished) throw new Error("回覆連線中斷，請重新整理對話確認狀態");
};
