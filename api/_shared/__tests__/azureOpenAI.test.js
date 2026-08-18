import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  buildResponseInput,
  generateJsonCompletion,
} = require("../azureOpenAI");

const originalEnv = {
  AZURE_OPENAI_ENDPOINT: process.env.AZURE_OPENAI_ENDPOINT,
  AZURE_OPENAI_API_KEY: process.env.AZURE_OPENAI_API_KEY,
  AZURE_OPENAI_DEPLOYMENT: process.env.AZURE_OPENAI_DEPLOYMENT,
  AZURE_OPENAI_FALLBACK_DEPLOYMENT: process.env.AZURE_OPENAI_FALLBACK_DEPLOYMENT,
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

describe("azureOpenAI", () => {
  beforeEach(() => {
    process.env.AZURE_OPENAI_ENDPOINT =
      "https://pixora.services.ai.azure.com/openai/v1";
    process.env.AZURE_OPENAI_API_KEY = "test-key";
    process.env.AZURE_OPENAI_DEPLOYMENT = "gpt-document-analysis";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("builds GPT image and PDF inputs for the Responses API", () => {
    const imageInput = buildResponseInput({
      userMessage: "Analyze image",
      imageDataUrl: "data:image/png;base64,AAAA",
    });
    const fileInput = buildResponseInput({
      userMessage: "Analyze PDF",
      fileDataUrl: "data:application/pdf;base64,BBBB",
      fileName: "scan.pdf",
    });

    expect(imageInput[0].content[1]).toEqual({
      type: "input_image",
      image_url: "data:image/png;base64,AAAA",
      detail: "auto",
    });
    expect(fileInput[0].content[1]).toEqual({
      type: "input_file",
      filename: "scan.pdf",
      file_data: "data:application/pdf;base64,BBBB",
    });
  });

  it("sends multimodal analysis to the configured GPT deployment", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            title: "分析結果",
            scenes: [{ scene_number: 1 }],
          }),
        }),
        { status: 200 }
      )
    );

    const result = await generateJsonCompletion({
      systemMessage: "Return document analysis JSON",
      userMessage: "Analyze the attached image",
      imageDataUrl: "data:image/jpeg;base64,CCCC",
      maxOutputTokens: 8192,
    });

    expect(result.title).toBe("分析結果");
    expect(fetchMock).toHaveBeenCalledOnce();

    const [endpoint, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(endpoint).toBe(
      "https://pixora.services.ai.azure.com/openai/v1/responses"
    );
    expect(options.headers["api-key"]).toBe("test-key");
    expect(body.model).toBe("gpt-document-analysis");
    expect(body.max_output_tokens).toBe(8192);
    expect(body.input[0].content[1].type).toBe("input_image");
  });

  /**
   * Peak-load rejections are about the size of this request, so the retry has
   * to change the request instead of merely repeating it.
   */
  it("shrinks the output budget and moves to the fallback deployment after a 429", async () => {
    process.env.AZURE_OPENAI_FALLBACK_DEPLOYMENT = "gpt-peer";
    vi.useFakeTimers();

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(peakLoadResponse())
      .mockResolvedValueOnce(jsonResponse({ svg: "<svg></svg>" }));

    const pending = generateJsonCompletion({
      systemMessage: "Author one slide",
      userMessage: "Slide 1",
      maxOutputTokens: 16000,
      deployment: "gpt-primary",
    });
    await vi.advanceTimersByTimeAsync(30000);
    const result = await pending;

    expect(result.svg).toBe("<svg></svg>");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const first = JSON.parse(fetchMock.mock.calls[0][1].body);
    const second = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(first.model).toBe("gpt-primary");
    expect(first.max_output_tokens).toBe(16000);
    expect(second.model).toBe("gpt-peer");
    expect(second.max_output_tokens).toBe(9600);
  });

  it("never shrinks the output budget below the floor and finally surfaces the rejection", async () => {
    vi.useFakeTimers();

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => peakLoadResponse());

    const pending = generateJsonCompletion({
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
      generateJsonCompletion({
        systemMessage: "Author one slide",
        userMessage: "Slide 1",
        maxOutputTokens: 16000,
      })
    ).rejects.toThrow("Invalid prompt (400)");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
