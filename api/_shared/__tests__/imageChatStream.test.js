import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const azurePath = require.resolve("../azureOpenAI");
const geminiPath = require.resolve("../gemini");
const runtimePath = require.resolve("../llmRuntime");

const { streamResponseCompletion } = require("../azureOpenAI");

const originalModules = {
  [azurePath]: require.cache[azurePath],
  [geminiPath]: require.cache[geminiPath],
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
require.cache[geminiPath] = {
  id: geminiPath,
  filename: geminiPath,
  loaded: true,
  exports: { streamGeminiResponse: ({ model, ...request }) => stubProvider(model, request) },
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
  provider: "azure-openai",
  modelName: "gpt-chat",
  endpoint: "https://pixora.services.ai.azure.com/openai/v1",
  apiKey: "azure-key",
};
const geminiModel = { id: "model-gemini", provider: "google-gemini", modelName: "gemini", apiKey: "g-key" };
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
    });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body).toMatchObject({ stream: true, parallel_tool_calls: true, instructions: "system" });
    expect(body.tools[0]).toMatchObject({ type: "function", name: "generate_image" });
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
    llm: { model: azureModel, fallback: geminiModel },
    systemMessage: "system",
    messages: [{ role: "user", content: "hi" }],
    tools,
    onTextDelta: vi.fn(),
    ...overrides,
  });

  it("falls back to the peer model when the primary fails before any text", async () => {
    providerResults = [Object.assign(new Error("busy"), { status: 429 }), { text: "ok", toolCalls: [] }];
    await expect(streamResponse(request())).resolves.toEqual({ text: "ok", toolCalls: [] });
    expect(providerCalls.map((call) => call.model.id)).toEqual(["model-azure", "model-gemini"]);
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
