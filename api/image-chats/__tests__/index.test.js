import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const auth = require("../../_shared/auth");
const identity = require("../../_shared/identity");
const rateLimit = require("../../_shared/rateLimit");
const imageJobs = require("../../_shared/imageJobs");
const imageUploads = require("../../_shared/imageUploads");
const llmModels = require("../../_shared/llmModels");
const llmRuntime = require("../../_shared/llmRuntime");
const chats = require("../../_shared/imageChats");
const chatMemory = require("../../_shared/imageChatMemory");

auth.requireAuth = vi.fn();
identity.resolveIdentity = vi.fn();
rateLimit.rateLimit = vi.fn();
imageJobs.createImageJob = vi.fn();
imageUploads.resolveOwnedImageUpload = vi.fn();
llmModels.resolveRoleModel = vi.fn();
llmRuntime.streamResponse = vi.fn();
[
  "attachImageJob", "beginTurn", "completeReply", "createChat", "deleteChat", "endReply",
  "getMessage", "getTurnMessages", "listChats", "listContextMessages", "listMessages",
  "recordMemoryNotes", "requireChat", "requireOwnedSucceededJob", "saveChatState", "stopTurn",
].forEach((name) => { chats[name] = vi.fn(); });
["appendMemoryNotes", "getMemory", "saveMemory"].forEach((name) => { chatMemory[name] = vi.fn(); });

const handler = require("../index");
const { LlmStreamError } = llmRuntime;

const chatId = "123e4567-e89b-42d3-a456-426614174000";
const turnId = "223e4567-e89b-42d3-a456-426614174000";
const sourceJobId = "323e4567-e89b-42d3-a456-426614174000";
const uploadId = "423e4567-e89b-42d3-a456-426614174000";
const owner = { tenantId: "tenant-1", userId: "user-1" };
const settings = { aspectRatio: "16:9", quality: "high", imageLanguage: "zh-TW", purpose: "freeform" };
const style = { id: null, name: "水彩", prompt: "soft watercolor", tags: ["watercolor"] };
const userMessage = { id: "m-user", role: "user", content: "畫一隻貓" };
const assistantMessage = { id: "m-assistant", role: "assistant", content: "", status: "responding" };
const llm = { model: { id: "chat-model" }, fallback: null };

const createStream = () => {
  const events = [];
  const controller = new AbortController();
  return {
    events,
    controller,
    stream: {
      signal: controller.signal,
      send: vi.fn((event, data) => events.push({ event, data })),
      end: vi.fn(),
    },
  };
};

const invoke = async ({ method = "POST", params = {}, body, query, sse = createStream() } = {}) => {
  const context = {
    log: { error: vi.fn() },
    openEventStream: vi.fn(() => sse.stream),
  };
  await handler(context, { method, headers: {}, params, body, query });
  return { context, ...sse };
};

const sendTurn = (overrides = {}, sse) =>
  invoke({
    params: { id: chatId, action: "messages" },
    body: { clientMessageId: turnId, content: "畫一隻貓", settings, style, ...overrides },
    sse,
  });

const authorize = () => {
  auth.requireAuth.mockResolvedValue({ user: { sub: "provider-user" } });
  identity.resolveIdentity.mockResolvedValue(owner);
  rateLimit.rateLimit.mockReturnValue({ limited: false });
};

describe("image chat turns", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    authorize();
    llmModels.resolveRoleModel.mockResolvedValue(llm);
    chats.getTurnMessages.mockResolvedValue({ userMessage: null, assistantMessage: null });
    chats.listContextMessages.mockResolvedValue([]);
    chatMemory.getMemory.mockResolvedValue({ content: "- 不要出現人臉", updatedAt: null });
    chats.beginTurn.mockResolvedValue({ userMessage, assistantMessage });
    chats.getMessage.mockResolvedValue({ ...assistantMessage, status: "completed" });
    let jobCount = 0;
    imageJobs.createImageJob.mockImplementation(async ({ afterInsert }) => {
      jobCount += 1;
      const job = { id: `job-${jobCount}`, status: "queued" };
      await afterInsert("tx-client", job);
      return job;
    });
  });

  it("streams a plain reply and completes it without queuing an image", async () => {
    llmRuntime.streamResponse.mockImplementation(async ({ onTextDelta }) => {
      onTextDelta("想要");
      onTextDelta("什麼風格？");
      return { text: "想要什麼風格？", toolCalls: [] };
    });

    const { events, stream } = await sendTurn();

    expect(llmModels.resolveRoleModel).toHaveBeenCalledWith("tenant-1", "image_chat");
    expect(chats.beginTurn).toHaveBeenCalledWith(
      { ...owner, chatId },
      expect.objectContaining({ turnId, content: "畫一隻貓", settings, style })
    );
    expect(events.map(({ event }) => event)).toEqual(["turn", "delta", "delta", "done"]);
    expect(chats.completeReply).toHaveBeenCalledWith("m-assistant", "想要什麼風格？");
    expect(imageJobs.createImageJob).not.toHaveBeenCalled();
    expect(stream.end).toHaveBeenCalled();
  });

  it("queues a styled generation and links it to the reply in the job transaction", async () => {
    llmRuntime.streamResponse.mockImplementation(async ({ onTextDelta, tools, systemMessage }) => {
      expect(tools.map((tool) => tool.name)).toEqual(["generate_image", "remember_preference"]);
      expect(systemMessage).toContain("- 不要出現人臉");
      onTextDelta("馬上畫。");
      return { text: "馬上畫。", toolCalls: [{ name: "generate_image", arguments: { prompt: "a cat on a sofa" } }] };
    });

    const { events } = await sendTurn();

    const request = imageJobs.createImageJob.mock.calls[0][0];
    expect(request).toMatchObject({
      ...owner, aspectRatio: "16:9", quality: "high", operation: "generate",
      sourceUploadId: null, sourceJobId: null,
    });
    expect(request.prompt).toContain("a cat on a sofa");
    expect(request.prompt).toContain("soft watercolor");
    expect(chats.attachImageJob).toHaveBeenCalledWith("tx-client", {
      messageId: "m-assistant", action: "generate", job: { id: "job-1", status: "queued" },
      sourceJobId: null, content: "馬上畫。", prompt: "a cat on a sofa", position: 0,
    });
    expect(events.find(({ event }) => event === "image").data).toEqual({
      action: "generate", jobId: "job-1", sourceJobId: null, prompt: "a cat on a sofa", status: "queued",
    });
    expect(chats.completeReply).not.toHaveBeenCalled();
    expect(events.at(-1).event).toBe("done");
  });

  it("queues one image per generate call, in order", async () => {
    llmRuntime.streamResponse.mockResolvedValue({
      text: "畫兩張。",
      toolCalls: [
        { name: "generate_image", arguments: { prompt: "spring" } },
        { name: "generate_image", arguments: { prompt: "autumn" } },
      ],
    });

    const { events } = await sendTurn();

    expect(imageJobs.createImageJob).toHaveBeenCalledTimes(2);
    expect(chats.attachImageJob.mock.calls.map(([, args]) => [args.position, args.prompt]))
      .toEqual([[0, "spring"], [1, "autumn"]]);
    expect(events.filter(({ event }) => event === "image").map(({ data }) => data.jobId))
      .toEqual(["job-1", "job-2"]);
  });

  it("saves remembered preferences before queuing images", async () => {
    llmRuntime.streamResponse.mockResolvedValue({
      text: "記住了，來畫。",
      toolCalls: [
        { name: "remember_preference", arguments: { note: "  一律使用 16:9  " } },
        { name: "generate_image", arguments: { prompt: "a cat" } },
      ],
    });

    const { events } = await sendTurn();

    expect(chatMemory.appendMemoryNotes).toHaveBeenCalledWith({ ...owner, notes: ["一律使用 16:9"] });
    expect(chats.recordMemoryNotes).toHaveBeenCalledWith("m-assistant", ["一律使用 16:9"]);
    expect(events.map(({ event }) => event)).toEqual(["turn", "memory", "image", "done"]);
  });

  it("completes a reply that only remembers a preference", async () => {
    llmRuntime.streamResponse.mockImplementation(async ({ onTextDelta }) => {
      onTextDelta("好的。");
      return { text: "好的。", toolCalls: [{ name: "remember_preference", arguments: { note: "不要文字" } }] };
    });
    await sendTurn();
    expect(chats.completeReply).toHaveBeenCalledWith("m-assistant", "好的。");
    expect(imageJobs.createImageJob).not.toHaveBeenCalled();
  });

  it("fails the turn without queuing images when memory is full", async () => {
    chatMemory.appendMemoryNotes.mockRejectedValue(
      new chats.ImageChatRequestError("偏好記憶已滿", "memory_full", 409)
    );
    llmRuntime.streamResponse.mockResolvedValue({
      text: "",
      toolCalls: [
        { name: "remember_preference", arguments: { note: "x" } },
        { name: "generate_image", arguments: { prompt: "a cat" } },
      ],
    });
    const { events } = await sendTurn();
    expect(imageJobs.createImageJob).not.toHaveBeenCalled();
    expect(chats.endReply).toHaveBeenCalledWith("m-assistant", expect.objectContaining({
      status: "failed", code: "memory_full",
    }));
    expect(events.map(({ event }) => event)).toEqual(["turn", "error", "done"]);
  });

  it("uses an attachment as the reference for a new image", async () => {
    imageUploads.resolveOwnedImageUpload.mockResolvedValue({ id: uploadId });
    llmRuntime.streamResponse.mockResolvedValue({
      text: "", toolCalls: [{ name: "generate_image", arguments: { prompt: "same layout, blue" } }],
    });
    await sendTurn({ attachmentUploadId: uploadId });
    expect(imageJobs.createImageJob).toHaveBeenCalledWith(expect.objectContaining({
      operation: "edit", sourceUploadId: uploadId, sourceJobId: null,
    }));
  });

  it("refines the selected version only when one is selected", async () => {
    llmRuntime.streamResponse.mockImplementation(async ({ tools }) => {
      expect(tools.map((tool) => tool.name)).toEqual(["generate_image", "refine_image", "remember_preference"]);
      return { text: "", toolCalls: [{ name: "refine_image", arguments: { instruction: "make the sky pink" } }] };
    });
    await sendTurn({ sourceJobId });
    expect(chats.requireOwnedSucceededJob).toHaveBeenCalledWith({ ...owner, jobId: sourceJobId });
    expect(imageJobs.createImageJob).toHaveBeenCalledWith(expect.objectContaining({
      operation: "edit", sourceUploadId: null, sourceJobId,
    }));
    expect(imageJobs.createImageJob.mock.calls[0][0].prompt).toContain("make the sky pink");
  });

  it("fails the reply when the model asks for a tool it was not offered", async () => {
    llmRuntime.streamResponse.mockImplementation(async ({ onTextDelta }) => {
      onTextDelta("改好了");
      return { text: "改好了", toolCalls: [{ name: "refine_image", arguments: { instruction: "x" } }] };
    });
    const { events } = await sendTurn();
    expect(imageJobs.createImageJob).not.toHaveBeenCalled();
    expect(chats.endReply).toHaveBeenCalledWith("m-assistant", expect.objectContaining({
      status: "failed", code: "invalid_action", content: "改好了",
    }));
    expect(events.map(({ event }) => event)).toEqual(["turn", "delta", "error", "done"]);
  });

  it("keeps partial text and records a stop as interrupted", async () => {
    llmRuntime.streamResponse.mockImplementation(async ({ onTextDelta }) => {
      onTextDelta("我先");
      throw new LlmStreamError("回覆已停止", "aborted", { partial: true });
    });
    await sendTurn();
    expect(chats.endReply).toHaveBeenCalledWith("m-assistant", {
      status: "interrupted", code: "stopped", message: "回覆已停止", content: "我先",
    });
  });

  it("records a client disconnect instead of the model error", async () => {
    const sse = createStream();
    llmRuntime.streamResponse.mockImplementation(async () => {
      sse.controller.abort();
      throw new LlmStreamError("回覆已停止", "aborted");
    });
    await sendTurn({}, sse);
    expect(chats.endReply).toHaveBeenCalledWith("m-assistant", expect.objectContaining({
      status: "interrupted", code: "client_disconnected",
    }));
  });

  it("ends the stream even when the final read fails", async () => {
    llmRuntime.streamResponse.mockResolvedValue({ text: "hi", toolCalls: [] });
    chats.getMessage.mockRejectedValue(new Error("db down"));
    const { events, stream } = await sendTurn();
    expect(events.at(-1)).toMatchObject({ event: "error", data: { code: "chat_failed" } });
    expect(stream.end).toHaveBeenCalled();
  });

  it("replays an accepted turn without calling the model again", async () => {
    chats.getTurnMessages.mockResolvedValue({ userMessage, assistantMessage: { ...assistantMessage, status: "completed" } });
    const { events } = await sendTurn();
    expect(events.map(({ event }) => event)).toEqual(["turn", "done"]);
    expect(chats.beginTurn).not.toHaveBeenCalled();
    expect(llmRuntime.streamResponse).not.toHaveBeenCalled();
  });

  it("answers admission failures as JSON before opening the stream", async () => {
    chats.beginTurn.mockRejectedValue(new chats.ImageChatRequestError("忙碌中", "turn_in_progress", 409));
    const { context } = await sendTurn();
    expect(context.res.status).toBe(409);
    expect(context.res.body.error.code).toBe("turn_in_progress");
    expect(context.openEventStream).not.toHaveBeenCalled();
  });

  it.each([
    [{ clientMessageId: "nope" }],
    [{ content: "   " }],
    [{ content: "字".repeat(4001) }],
    [{ settings: { ...settings, aspectRatio: "7:1" } }],
    [{ settings: { ...settings, purpose: "poster" } }],
    [{ model: "gpt" }],
  ])("rejects invalid turn input %#", async (override) => {
    const { context } = await sendTurn(override);
    expect(context.res.status).toBe(400);
    expect(chats.beginTurn).not.toHaveBeenCalled();
  });

  it("rejects a foreign attachment before recording the turn", async () => {
    imageUploads.resolveOwnedImageUpload.mockResolvedValue(null);
    const { context } = await sendTurn({ attachmentUploadId: uploadId });
    expect(context.res.status).toBe(404);
    expect(chats.beginTurn).not.toHaveBeenCalled();
  });
});

describe("image chat resources", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    authorize();
  });

  it("stops an in-flight turn in the database and in this process", async () => {
    const stop = new AbortController();
    handler.activeTurns.set(turnId, stop);
    chats.stopTurn.mockResolvedValue(true);
    const { context } = await invoke({ params: { id: chatId, turnId } });
    expect(chats.stopTurn).toHaveBeenCalledWith({ ...owner, chatId }, turnId);
    expect(stop.signal.aborted).toBe(true);
    expect(context.res.body).toEqual({ stopped: true });
    handler.activeTurns.delete(turnId);
  });

  it("returns the current chat with a state conflict", async () => {
    const conflict = new chats.ImageChatRequestError("衝突", "state_conflict", 409);
    conflict.chat = { id: chatId, stateVersion: 3 };
    chats.saveChatState.mockRejectedValue(conflict);
    const { context } = await invoke({
      method: "PUT",
      params: { id: chatId, action: "state" },
      body: { stateVersion: 2, draft: "", settings, selectedJobId: null },
    });
    expect(context.res.status).toBe(409);
    expect(context.res.body.chat).toEqual({ id: chatId, stateVersion: 3 });
  });

  it("creates, lists, reads and deletes owned chats", async () => {
    chats.createChat.mockResolvedValue({ id: chatId });
    expect((await invoke({ body: { settings } })).context.res.status).toBe(201);
    expect(chats.createChat).toHaveBeenCalledWith({ ...owner, settings });

    chats.listChats.mockResolvedValue({ items: [], nextCursor: null });
    await invoke({ method: "GET", query: { cursor: "abc" } });
    expect(chats.listChats).toHaveBeenCalledWith({ ...owner, cursor: "abc" });

    chats.requireChat.mockResolvedValue({ id: chatId });
    chats.listMessages.mockResolvedValue({ items: [userMessage], nextBefore: null });
    const read = await invoke({ method: "GET", params: { id: chatId } });
    expect(read.context.res.body).toEqual({ chat: { id: chatId }, messages: [userMessage], nextBefore: null });

    const removed = await invoke({ method: "DELETE", params: { id: chatId } });
    expect(chats.deleteChat).toHaveBeenCalledWith({ ...owner, chatId });
    expect(removed.context.res.status).toBe(204);
  });

  it("rejects malformed chat IDs", async () => {
    const { context } = await invoke({ method: "GET", params: { id: "bad" } });
    expect(context.res.status).toBe(400);
    expect(chats.requireChat).not.toHaveBeenCalled();
  });
});
