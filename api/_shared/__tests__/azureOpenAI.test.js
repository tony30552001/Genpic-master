import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildResponseInput, postJsonCompletion } = require("../azureOpenAI");

const primaryModel = {
  modelName: "gpt-document-analysis",
  endpoint: "https://pixora.services.ai.azure.com/openai/v1",
  apiKey: "test-key",
};

const jsonResponse = (payload) =>
  new Response(JSON.stringify({ output_text: JSON.stringify(payload) }), {
    status: 200,
  });

describe("azureOpenAI", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
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

  it("sends multimodal analysis to the model supplied by the caller", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        jsonResponse({ title: "分析結果", scenes: [{ scene_number: 1 }] })
      );

    const result = await postJsonCompletion({
      model: primaryModel,
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
