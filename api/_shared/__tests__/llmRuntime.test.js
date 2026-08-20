import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const geminiPath = require.resolve("../gemini");
const runtimePath = require.resolve("../llmRuntime");

const originalModules = {
  [geminiPath]: require.cache[geminiPath],
  [runtimePath]: require.cache[runtimePath],
};

const geminiCalls = [];
let geminiResults = [];

require.cache[geminiPath] = {
  id: geminiPath,
  filename: geminiPath,
  loaded: true,
  exports: {
    postGeminiJson: async (request) => {
      geminiCalls.push(request);
      const next = geminiResults.shift();
      if (next instanceof Error) throw next;
      return next ?? {};
    },
  },
};

const { generateJson } = require("../llmRuntime");

const azureModel = {
  id: "model-azure",
  provider: "azure-openai",
  modelName: "gpt-document-analysis",
  endpoint: "https://pixora.services.ai.azure.com/openai/v1",
  apiKey: "azure-key",
};

const geminiModel = {
  id: "model-gemini",
  provider: "google-gemini",
  modelName: "gemini-2.0-flash",
  apiKey: "gemini-key",
};

const peakLoadResponse = () =>
  new Response(
    JSON.stringify({
      error: {
        message:
          "The system is currently experiencing high demand and cannot process your request.",
      },
    }),
    { status: 429 }
  );

const jsonResponse = (payload) =>
  new Response(JSON.stringify({ output_text: JSON.stringify(payload) }), {
    status: 200,
  });

beforeEach(() => {
  geminiCalls.length = 0;
  geminiResults = [];
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

afterAll(() => {
  for (const [path, mod] of Object.entries(originalModules)) {
    if (mod) {
      require.cache[path] = mod;
    } else {
      delete require.cache[path];
    }
  }
});

describe("llmRuntime", () => {
  it("sends an attachment as an Azure image input", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ title: "分析結果" }));

    const result = await generateJson({
      llm: { model: azureModel, fallback: null },
      systemMessage: "Return JSON",
      userMessage: "Analyze",
      attachment: { mimeType: "image/png", base64: "AAAA" },
      maxOutputTokens: 8192,
    });

    expect(result.title).toBe("分析結果");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.input[0].content[1]).toEqual({
      type: "input_image",
      image_url: "data:image/png;base64,AAAA",
      detail: "auto",
    });
  });

  it("sends a PDF attachment as an Azure file input", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ title: "掃描件" }));

    await generateJson({
      llm: { model: azureModel },
      systemMessage: "Return JSON",
      userMessage: "Analyze",
      attachment: { mimeType: "application/pdf", base64: "BBBB" },
      fileName: "scan.pdf",
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.input[0].content[1]).toEqual({
      type: "input_file",
      filename: "scan.pdf",
      file_data: "data:application/pdf;base64,BBBB",
    });
  });

  it("dispatches a Gemini model to the Gemini client", async () => {
    geminiResults.push({ style_name: "水彩" });

    const result = await generateJson({
      llm: { model: geminiModel },
      systemMessage: "Return JSON",
      userMessage: "Analyze",
      attachment: { mimeType: "image/jpeg", base64: "CCCC" },
      maxOutputTokens: 4096,
    });

    expect(result.style_name).toBe("水彩");
    expect(geminiCalls).toHaveLength(1);
    expect(geminiCalls[0]).toMatchObject({
      model: geminiModel,
      attachment: { mimeType: "image/jpeg", base64: "CCCC" },
      maxOutputTokens: 4096,
    });
  });

  /**
   * Roles are no longer pinned to one provider, so the peer model may need a
   * different client than the primary one.
   */
  it("fails over from Azure to a Gemini peer model after a 429", async () => {
    vi.useFakeTimers();

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(peakLoadResponse());
    geminiResults.push({ svg: "<svg></svg>" });

    const pending = generateJson({
      llm: { model: azureModel, fallback: geminiModel },
      systemMessage: "Author one slide",
      userMessage: "Slide 1",
      maxOutputTokens: 16000,
    });
    await vi.advanceTimersByTimeAsync(30000);
    const result = await pending;

    expect(result.svg).toBe("<svg></svg>");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(geminiCalls[0].maxOutputTokens).toBe(9600);
  });

  it("never shrinks the output budget below the floor and finally surfaces the rejection", async () => {
    vi.useFakeTimers();

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => peakLoadResponse());

    const pending = generateJson({
      llm: { model: azureModel },
      systemMessage: "Author one slide",
      userMessage: "Slide 1",
      maxOutputTokens: 16000,
    });
    const assertion = expect(pending).rejects.toThrow(
      /high demand and cannot process your request\. \(429\)/
    );
    await vi.advanceTimersByTimeAsync(60000);
    await assertion;

    expect(fetchMock).toHaveBeenCalledTimes(4);
    const budgets = fetchMock.mock.calls.map(
      ([, options]) => JSON.parse(options.body).max_output_tokens
    );
    expect(budgets).toEqual([16000, 9600, 8000, 8000]);
  });

  it("does not retry rejections the request itself caused", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "Invalid prompt" } }), {
        status: 400,
      })
    );

    await expect(
      generateJson({
        llm: { model: azureModel, fallback: geminiModel },
        systemMessage: "Author one slide",
        userMessage: "Slide 1",
      })
    ).rejects.toThrow("Invalid prompt (400)");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(geminiCalls).toHaveLength(0);
  });

  it("rejects an Azure model that is missing its endpoint", async () => {
    await expect(
      generateJson({
        llm: { model: { ...azureModel, endpoint: "" } },
        systemMessage: "Return JSON",
        userMessage: "Analyze",
      })
    ).rejects.toThrow("主要分析模型缺少 Azure OpenAI 端點");
  });
});
