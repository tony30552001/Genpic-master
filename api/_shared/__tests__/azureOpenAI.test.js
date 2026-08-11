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
};

describe("azureOpenAI", () => {
  beforeEach(() => {
    process.env.AZURE_OPENAI_ENDPOINT =
      "https://pixora.services.ai.azure.com/openai/v1";
    process.env.AZURE_OPENAI_API_KEY = "test-key";
    process.env.AZURE_OPENAI_DEPLOYMENT = "gpt-document-analysis";
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
});
