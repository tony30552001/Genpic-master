import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const azurePath = require.resolve("../azureOpenAI");
const runtimePath = require.resolve("../llmRuntime");

const { streamResponseCompletion } = require("../azureOpenAI");

const originalModules = {
  [azurePath]: require.cache[azurePath],
  [runtimePath]: require.cache[runtimePath],
};

const providerCalls = [];
let providerResults = [];
const stubProvider = async (model, request) => {
  providerCalls.push({ model, request });
  const next = providerResults.shift();
  if (typeof next === "function") return next(request);
  if (next instanceof Error) throw next;
  return next;
};

delete require.cache[runtimePath];
require.cache[azurePath] = {
  id: azurePath,
  filename: azurePath,
  loaded: true,
  exports: { streamResponseCompletion: ({ model, ...request }) => stubProvider(model, request) },
};
const { streamResponse } = require("../llmRuntime");

const encoder = new TextEncoder();
const sseBody = (chunks) =>
  new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(typeof chunk === "string" ? encoder.encode(chunk) : chunk));
      controller.close();
    },
  });
const sse = (event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;

const azureModel = {
  id: "model-azure",
  modelName: "gpt-chat",
  endpoint: "https://pixora.services.ai.azure.com/openai/v1",
  apiKey: "azure-key",
};
const backupModel = { ...azureModel, id: "model-backup", modelName: "gpt-backup" };
const tools = [{ name: "generate_image", description: "draw", parameters: { type: "object" } }];

describe("Azure OpenAI streamed responses", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => vi.unstubAllGlobals());

  it("streams text split inside a UTF-8 character and returns the tool call", async () => {
    const payload = encoder.encode(sse({ type: "response.output_text.delta", delta: "好的，畫一張圖" }));
    const split = payload.indexOf(0xe5) + 1;
    fetch.mockResolvedValue(new Response(sseBody([
      payload.slice(0, split),
      payload.slice(split),
      sse({
        type: "response.output_item.done",
        item: { type: "function_call", name: "generate_image", arguments: '{"prompt":"一隻貓"}' },
      }),
      sse({ type: "response.completed" }),
    ]), { status: 200 }));
    const deltas = [];

    const result = await streamResponseCompletion({
      model: azureModel,
      systemMessage: "system",
      messages: [{ role: "user", content: "畫貓" }],
      tools,
      onTextDelta: (text) => deltas.push(text),
    });

    expect(deltas.join("")).toBe("好的，畫一張圖");
    expect(result).toEqual({
      text: "好的，畫一張圖",
      toolCalls: [{ name: "generate_image", arguments: { prompt: "一隻貓" } }],
      searches: [],
    });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body).toMatchObject({ stream: true, parallel_tool_calls: true, instructions: "system" });
    expect(body.tools[0]).toMatchObject({ type: "function", name: "generate_image" });
    expect(body).not.toHaveProperty("max_tool_calls");
  });

  it("enables capped web search, reports each search and strips citation markers", async () => {
    const cited = "https://example.com/cited";
    fetch.mockResolvedValue(new Response(sseBody([
      sse({ type: "response.output_item.added", item: { id: "ws_1", type: "web_search_call", status: "in_progress" } }),
      sse({
        type: "response.output_item.done",
        item: {
          id: "ws_1",
          type: "web_search_call",
          status: "completed",
          action: {
            type: "search",
            query: "2026 台北燈會 主燈",
            sources: [
              ...["a", "b", "c", "d", "e"].map((name) => ({ type: "url", url: `https://example.com/${name}` })),
              { type: "url", url: cited },
              { type: "url", url: "javascript:alert(1)" },
            ],
          },
        },
      }),
      sse({ type: "response.output_text.delta", delta: "主燈是駿馬。\ue200cite" }),
      sse({ type: "response.output_text.delta", delta: "\ue202turn0search0\ue201我來畫。" }),
      sse({
        type: "response.output_text.annotation.added",
        annotation: { type: "url_citation", url: cited, title: "燈會官網" },
      }),
      sse({ type: "response.completed" }),
    ])));
    const deltas = [];
    const onSearch = vi.fn();

    const result = await streamResponseCompletion({
      model: azureModel,
      systemMessage: "s",
      messages: [],
      tools,
      maxWebSearches: 2,
      onTextDelta: (text) => deltas.push(text),
      onSearch,
    });

    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.tools[0]).toMatchObject({ type: "web_search", user_location: { country: "TW" } });
    expect(body).toMatchObject({ max_tool_calls: 2, include: ["web_search_call.action.sources"] });
    expect(deltas.join("")).toBe("主燈是駿馬。我來畫。");
    expect(result.text).toBe("主燈是駿馬。我來畫。");
    expect(onSearch.mock.calls.map(([search]) => [search.status, search.query])).toEqual([
      ["searching", ""],
      ["completed", "2026 台北燈會 主燈"],
    ]);
    expect(result.searches).toHaveLength(1);
    expect(result.searches[0].sources).toHaveLength(5);
    expect(result.searches[0].sources[0]).toEqual({ url: cited, title: "燈會官網" });
    expect(result.searches[0].sources.every(({ url }) => url.startsWith("https://"))).toBe(true);
  });

  it("drops Markdown citations split across deltas but keeps ordinary brackets", async () => {
    const parts = ["無法確認(例如[本人])。([you", "tube.com](https://www.youtube.com/", "@x)) 請上傳", "參考圖[a](https://a.example)"];
    fetch.mockResolvedValue(new Response(sseBody([
      ...parts.map((delta) => sse({ type: "response.output_text.delta", delta })),
      sse({ type: "response.completed" }),
    ])));
    const deltas = [];

    const result = await streamResponseCompletion({
      model: azureModel, systemMessage: "s", messages: [], tools, maxWebSearches: 2,
      onTextDelta: (text) => deltas.push(text),
    });

    expect(result.text).toBe("無法確認(例如[本人])。 請上傳參考圖");
    expect(deltas.join("")).toBe(result.text);
  });

  it("reports a search the stream never closed as failed", async () => {
    fetch.mockResolvedValue(new Response(sseBody([
      sse({ type: "response.output_item.added", item: { id: "ws_1", type: "web_search_call" } }),
      sse({ type: "response.output_text.delta", delta: "找不到資料" }),
      sse({ type: "response.completed" }),
    ])));

    const result = await streamResponseCompletion({
      model: azureModel, systemMessage: "s", messages: [], tools, maxWebSearches: 2, onTextDelta: () => {},
    });

    expect(result.searches).toEqual([{ id: "ws_1", status: "failed", query: "", sources: [] }]);
  });

  it("rejects tool arguments that are not a JSON object", async () => {
    fetch.mockResolvedValue(new Response(sseBody([
      sse({ type: "response.output_item.done", item: { type: "function_call", name: "generate_image", arguments: "[1]" } }),
      sse({ type: "response.completed" }),
    ])));
    await expect(streamResponseCompletion({
      model: azureModel, systemMessage: "s", messages: [], tools, onTextDelta: () => {},
    })).rejects.toMatchObject({ code: "invalid_tool_call" });
  });

  it("treats an incomplete response as truncated and a cut stream as a failure", async () => {
    fetch.mockResolvedValueOnce(new Response(sseBody([
      sse({ type: "response.incomplete", response: { incomplete_details: { reason: "max_output_tokens" } } }),
    ])));
    await expect(streamResponseCompletion({
      model: azureModel, systemMessage: "s", messages: [], tools, onTextDelta: () => {},
    })).rejects.toMatchObject({ code: "output_truncated" });

    fetch.mockResolvedValueOnce(new Response(sseBody([
      sse({ type: "response.output_text.delta", delta: "半" }),
    ])));
    await expect(streamResponseCompletion({
      model: azureModel, systemMessage: "s", messages: [], tools, onTextDelta: () => {},
    })).rejects.toMatchObject({ status: 502 });
  });

  it("surfaces HTTP errors with their status for retry decisions", async () => {
    fetch.mockResolvedValue(new Response(JSON.stringify({ error: { message: "busy" } }), { status: 429 }));
    await expect(streamResponseCompletion({
      model: azureModel, systemMessage: "s", messages: [], tools, onTextDelta: () => {},
    })).rejects.toMatchObject({ status: 429 });
  });
});

describe("llmRuntime.streamResponse", () => {
  beforeEach(() => {
    providerCalls.length = 0;
    providerResults = [];
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(() => {
    Object.entries(originalModules).forEach(([path, module]) => {
      if (module) require.cache[path] = module;
      else delete require.cache[path];
    });
  });

  const request = (overrides = {}) => ({
    llm: { model: azureModel, fallback: backupModel },
    systemMessage: "system",
    messages: [{ role: "user", content: "hi" }],
    tools,
    onTextDelta: vi.fn(),
    ...overrides,
  });

  it("falls back to the backup model when the primary fails before any output", async () => {
    const reply = { text: "ok", toolCalls: [], searches: [] };
    providerResults = [Object.assign(new Error("busy"), { status: 429 }), reply];
    await expect(streamResponse(request({ maxWebSearches: 2 }))).resolves.toEqual(reply);
    expect(providerCalls.map((call) => call.model.id)).toEqual(["model-azure", "model-backup"]);
    expect(providerCalls[1].request.maxWebSearches).toBe(2);
  });

  it("never retries once a search was shown to the user", async () => {
    providerResults = [
      (req) => {
        req.onSearch({ id: "ws_1", status: "searching", query: "", sources: [] });
        throw Object.assign(new Error("reset"), { status: 503 });
      },
    ];
    const onSearch = vi.fn();
    await expect(streamResponse(request({ maxWebSearches: 2, onSearch }))).rejects.toMatchObject({
      partial: true,
    });
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(providerCalls).toHaveLength(1);
  });

  it("never retries once text reached the user", async () => {
    providerResults = [
      (req) => {
        req.onTextDelta("部分");
        throw Object.assign(new Error("reset"), { status: 503 });
      },
    ];
    const onTextDelta = vi.fn();
    await expect(streamResponse(request({ onTextDelta }))).rejects.toMatchObject({
      code: "llm_failed",
      partial: true,
    });
    expect(onTextDelta).toHaveBeenCalledWith("部分");
    expect(providerCalls).toHaveLength(1);
  });

  it("reports a caller abort as aborted and a deadline as llm_timeout", async () => {
    const waitForAbort = (req) =>
      new Promise((_, reject) => req.signal.addEventListener("abort", () => reject(new Error("aborted"))));

    const controller = new AbortController();
    providerResults = [waitForAbort];
    const stopped = streamResponse(request({ signal: controller.signal }));
    controller.abort();
    await expect(stopped).rejects.toMatchObject({ code: "aborted" });

    providerResults = [waitForAbort];
    await expect(streamResponse(request({ deadlineMs: 10 }))).rejects.toMatchObject({ code: "llm_timeout" });
  });

  it("keeps invalid tool calls and truncation as distinct non-retried failures", async () => {
    providerResults = [Object.assign(new Error("bad"), { code: "invalid_tool_call" })];
    await expect(streamResponse(request())).rejects.toMatchObject({ code: "invalid_tool_call" });
    expect(providerCalls).toHaveLength(1);
  });
});
