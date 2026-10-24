import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../services/imageChatService", () => ({
  imageJobImageUrl: (jobId) => `/api/image-jobs/${jobId}/image`,
  listChats: vi.fn(),
  createChat: vi.fn(),
  getChat: vi.fn(),
  listMessages: vi.fn(),
  saveChatState: vi.fn(),
  deleteChat: vi.fn(),
  stopTurn: vi.fn(),
  sendChatMessage: vi.fn(),
}));

vi.mock("../../services/aiService", () => ({
  waitForImageJob: vi.fn(),
}));

import * as chatApi from "../../services/imageChatService";
import { waitForImageJob } from "../../services/aiService";
import useImageChat from "../useImageChat";

const SETTINGS = { aspectRatio: "16:9", quality: null, imageLanguage: "zh-TW", purpose: "infographic" };

const chatRecord = (id, overrides = {}) => ({
  id,
  title: null,
  draft: "",
  settings: SETTINGS,
  selectedJobId: null,
  stateVersion: 1,
  updatedAt: "2026-01-01T00:00:00Z",
  ...overrides,
});

const serverMessages = (turnId, assistant = {}) => ({
  userMessage: { id: "u1", turnId, role: "user", content: "畫一隻貓", input: {}, status: "completed", error: null },
  assistantMessage: { id: "a1", turnId, role: "assistant", content: "", images: [], input: {}, status: "responding", error: null, ...assistant },
});

const renderChat = () =>
  renderHook(() => useImageChat({ enabled: true, initialSettings: SETTINGS }));

describe("useImageChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chatApi.listChats.mockResolvedValue({ items: [], nextCursor: null });
    chatApi.saveChatState.mockImplementation(async ({ chatId, stateVersion }) =>
      chatRecord(chatId, { stateVersion: stateVersion + 1 })
    );
  });

  it("creates a chat, streams the reply and selects the finished image", async () => {
    chatApi.createChat.mockResolvedValue(chatRecord("c1"));
    let resolveJob;
    waitForImageJob.mockReturnValue(new Promise((resolve) => { resolveJob = resolve; }));
    chatApi.sendChatMessage.mockImplementation(async ({ body, onEvent }) => {
      const turnId = body.clientMessageId;
      onEvent({ type: "turn", data: serverMessages(turnId) });
      onEvent({ type: "delta", data: { text: "好的，" } });
      onEvent({
        type: "image",
        data: { action: "generate", jobId: "job-1", sourceJobId: null, prompt: "一隻貓", status: "queued" },
      });
      onEvent({
        type: "done",
        data: {
          message: {
            ...serverMessages(turnId).assistantMessage,
            content: "好的，馬上畫。",
            images: [
              { jobId: "job-1", action: "generate", prompt: "一隻貓", sourceJobId: null, status: "queued", imageUrl: null, error: null },
            ],
            status: "image_pending",
          },
        },
      });
    });
    const { result } = renderChat();
    await waitFor(() => expect(chatApi.listChats).toHaveBeenCalled());

    let sent;
    await act(async () => {
      sent = await result.current.send("畫一隻貓");
    });

    expect(sent).toBe(true);
    expect(chatApi.createChat).toHaveBeenCalledWith({ settings: SETTINGS });
    expect(chatApi.sendChatMessage.mock.calls[0][0].body).toMatchObject({
      content: "畫一隻貓",
      settings: SETTINGS,
      style: null,
      attachmentUploadId: null,
      sourceJobId: null,
    });
    expect(chatApi.sendChatMessage.mock.calls[0][0].body).not.toHaveProperty("model");
    expect(result.current.messages.map((message) => message.id)).toEqual(["u1", "a1"]);
    expect(result.current.pendingImage).toMatchObject({ content: "好的，馬上畫。", images: [{ jobId: "job-1" }] });
    expect(result.current.chats[0]).toMatchObject({ id: "c1", title: "畫一隻貓" });

    await act(async () => {
      resolveJob({ status: "succeeded" });
    });

    expect(result.current.pendingImage).toBeNull();
    expect(result.current.selectedJobId).toBe("job-1");
    expect(result.current.selectedVersion).toMatchObject({ id: "job-1", imageUrl: "/api/image-jobs/job-1/image" });
    expect(result.current.getVersionLabel(result.current.selectedVersion)).toBe("v1");
  });

  it("tracks several images in one reply and settles when each is terminal", async () => {
    chatApi.createChat.mockResolvedValue(chatRecord("c1"));
    waitForImageJob.mockImplementation(async ({ jobId }) => {
      if (jobId !== "job-1") throw new Error("內容審查未通過");
      return { status: "succeeded" };
    });
    const image = (jobId, prompt) => ({
      jobId, action: "generate", prompt, sourceJobId: null, status: "queued", imageUrl: null, error: null,
    });
    chatApi.sendChatMessage.mockImplementation(async ({ body, onEvent }) => {
      const turnId = body.clientMessageId;
      onEvent({ type: "turn", data: serverMessages(turnId) });
      onEvent({ type: "memory", data: { notes: ["圖中不要人臉"] } });
      onEvent({ type: "image", data: { ...image("job-1", "貓"), status: "queued" } });
      onEvent({ type: "image", data: { ...image("job-2", "狗"), status: "queued" } });
      onEvent({
        type: "done",
        data: {
          message: {
            ...serverMessages(turnId).assistantMessage,
            content: "畫兩張",
            images: [image("job-1", "貓"), image("job-2", "狗")],
            input: { memoryNotes: ["圖中不要人臉"] },
            status: "image_pending",
          },
        },
      });
    });
    const { result } = renderChat();
    await waitFor(() => expect(chatApi.listChats).toHaveBeenCalled());

    await act(async () => {
      await result.current.send("畫貓和狗");
    });

    await waitFor(() => expect(result.current.pendingImage).toBeNull());
    const assistant = result.current.messages.find((message) => message.role === "assistant");
    expect(assistant.status).toBe("completed");
    expect(assistant.input.memoryNotes).toEqual(["圖中不要人臉"]);
    expect(assistant.images.map((item) => item.status)).toEqual(["succeeded", "failed"]);
    expect(result.current.versions.map((version) => version.id)).toEqual(["job-1"]);
  });

  it("restores the draft and removes the optimistic turn when the message is not admitted", async () => {
    chatApi.createChat.mockResolvedValue(chatRecord("c1"));
    chatApi.sendChatMessage.mockRejectedValue(Object.assign(new Error("已有進行中的回覆"), { code: "turn_in_progress" }));
    const { result } = renderChat();
    await waitFor(() => expect(chatApi.listChats).toHaveBeenCalled());

    let sent;
    await act(async () => {
      sent = await result.current.send("  畫一隻貓  ");
    });

    expect(sent).toBe(false);
    expect(result.current.messages).toEqual([]);
    expect(result.current.draft).toBe("畫一隻貓");
    expect(result.current.error).toBe("已有進行中的回覆");
    expect(result.current.sending).toBeNull();
  });

  it("keeps a reply for one chat out of another chat opened mid-stream", async () => {
    chatApi.getChat.mockImplementation(async ({ chatId }) => ({
      chat: chatRecord(chatId),
      messages: [],
      nextBefore: null,
    }));
    let emit;
    let finish;
    chatApi.sendChatMessage.mockImplementation(({ body, onEvent }) => {
      emit = (event) => onEvent(event);
      emit({ type: "turn", data: serverMessages(body.clientMessageId) });
      return new Promise((resolve) => { finish = resolve; });
    });
    const { result } = renderChat();

    await act(async () => {
      await result.current.openChat("a");
    });
    let sending;
    act(() => {
      sending = result.current.send("畫一隻貓");
    });
    await waitFor(() => expect(result.current.messages).toHaveLength(2));

    await act(async () => {
      await result.current.openChat("b");
    });
    act(() => {
      emit({ type: "delta", data: { text: "不該出現" } });
    });

    expect(result.current.chat.id).toBe("b");
    expect(result.current.messages).toEqual([]);

    await act(async () => {
      emit({ type: "done", data: { message: { ...serverMessages("x").assistantMessage, status: "completed" } } });
      finish();
      await sending;
    });
    expect(result.current.messages).toEqual([]);
  });
});
