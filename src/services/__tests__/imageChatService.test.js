import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../apiClient", () => ({
  apiDelete: vi.fn(),
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPostStream: vi.fn(),
  apiPut: vi.fn(),
}));

import { apiPostStream } from "../apiClient";
import { sendChatMessage } from "../imageChatService";

const streamOf = (chunks) =>
  new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    })
  );

const encode = (text) => new TextEncoder().encode(text);

describe("sendChatMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses events split across chunks, including a split multi-byte character", async () => {
    const bytes = encode(
      'event: turn\ndata: {"turnId":"t1"}\n\nevent: delta\ndata: {"text":"你好"}\n\nevent: done\ndata: {"message":{"id":"m"}}\n\n'
    );
    const splitAt = bytes.indexOf(0xe4) + 1;
    apiPostStream.mockResolvedValue(streamOf([bytes.slice(0, 10), bytes.slice(10, splitAt), bytes.slice(splitAt)]));
    const onEvent = vi.fn();

    await sendChatMessage({ chatId: "c1", body: { content: "hi" }, onEvent });

    expect(apiPostStream).toHaveBeenCalledWith("/api/image-chats/c1/messages", { content: "hi" }, { signal: undefined });
    expect(onEvent.mock.calls.map(([event]) => event)).toEqual([
      { type: "turn", data: { turnId: "t1" } },
      { type: "delta", data: { text: "你好" } },
      { type: "done", data: { message: { id: "m" } } },
    ]);
  });

  it("fails when the stream ends before the done event", async () => {
    apiPostStream.mockResolvedValue(streamOf([encode('event: turn\ndata: {"turnId":"t1"}\n\n')]));

    await expect(sendChatMessage({ chatId: "c1", body: {}, onEvent: vi.fn() })).rejects.toThrow("回覆連線中斷");
  });
});
