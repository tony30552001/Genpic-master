import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const genaiPath = require.resolve("@google/genai", { paths: [require.resolve("../gemini")] });
const geminiPath = require.resolve("../gemini");
const originalGenai = require.cache[genaiPath];
const originalGemini = require.cache[geminiPath];

const generateContentStream = vi.fn();
require.cache[genaiPath] = {
  id: genaiPath,
  filename: genaiPath,
  loaded: true,
  exports: {
    GoogleGenAI: class {
      constructor() {
        this.models = { generateContentStream };
      }
    },
  },
};
delete require.cache[geminiPath];
const { streamGeminiResponse } = require("../gemini");

const model = { modelName: "gemini-chat", apiKey: "key" };
const tools = [{ name: "generate_image", description: "draw", parameters: { type: "object" } }];
const chunks = (...items) => (async function* stream() { yield* items; })();
const part = (value, finishReason) => ({ candidates: [{ content: { parts: [value] }, finishReason }] });

describe("Gemini streamed responses", () => {
  beforeEach(() => generateContentStream.mockReset());
  afterAll(() => {
    if (originalGenai) require.cache[genaiPath] = originalGenai;
    else delete require.cache[genaiPath];
    if (originalGemini) require.cache[geminiPath] = originalGemini;
    else delete require.cache[geminiPath];
  });

  it("streams visible text, skips thoughts and returns the function call", async () => {
    generateContentStream.mockResolvedValue(chunks(
      part({ text: "思考中", thought: true }),
      part({ text: "好，" }),
      part({ functionCall: { name: "generate_image", args: { prompt: "cat" } } }, "STOP"),
    ));
    const deltas = [];
    const signal = new AbortController().signal;

    const result = await streamGeminiResponse({
      model, systemMessage: "sys", tools, signal,
      messages: [{ role: "user", content: "hi" }, { role: "assistant", content: "嗨" }],
      onTextDelta: (text) => deltas.push(text),
    });

    expect(deltas).toEqual(["好，"]);
    expect(result).toEqual({ text: "好，", toolCalls: [{ name: "generate_image", arguments: { prompt: "cat" } }] });
    const request = generateContentStream.mock.calls[0][0];
    expect(request.contents.map((content) => content.role)).toEqual(["user", "model"]);
    expect(request.config).toMatchObject({
      systemInstruction: "sys",
      abortSignal: signal,
      tools: [{ functionDeclarations: [{ name: "generate_image", parametersJsonSchema: { type: "object" } }] }],
    });
  });

  it.each([
    ["MAX_TOKENS", { code: "output_truncated" }],
    ["SAFETY", { status: 502 }],
    [undefined, { status: 502 }],
  ])("fails a stream that finished with %s", async (finishReason, expected) => {
    generateContentStream.mockResolvedValue(chunks(part({ text: "半" }, finishReason)));
    await expect(streamGeminiResponse({
      model, systemMessage: "s", messages: [], tools, onTextDelta: () => {},
    })).rejects.toMatchObject(expected);
  });
});
