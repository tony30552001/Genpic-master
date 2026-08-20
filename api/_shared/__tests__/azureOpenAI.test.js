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

  it("reports a truncated reasoning response instead of a malformed one", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "incomplete",
          incomplete_details: { reason: "max_output_tokens" },
          output: [{ type: "reasoning", summary: [] }],
          usage: {
            output_tokens: 8000,
            output_tokens_details: { reasoning_tokens: 7998 },
          },
        }),
        { status: 200 }
      )
    );

    const failure = await postJsonCompletion({
      model: primaryModel,
      systemMessage: "Return JSON",
      userMessage: "Plan an outline",
      maxOutputTokens: 8000,
    }).catch((error) => error);

    expect(failure.code).toBe("output_truncated");
    expect(failure.message).toBe(
      "分析模型未在輸出上限 8000 內完成回應（max_output_tokens，推理用掉 7998 tokens）"
    );
  });

  /**
   * Some Foundry deployments cut the answer far below the budget we asked for,
   * so asking for a bigger budget cannot help.
   */
  it("does not mark a deployment-capped answer as retryable", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "incomplete",
          incomplete_details: { reason: "max_output_tokens" },
          output: [{ type: "message", content: [] }],
          usage: {
            output_tokens: 4096,
            output_tokens_details: { reasoning_tokens: 0 },
          },
        }),
        { status: 200 }
      )
    );

    const failure = await postJsonCompletion({
      model: primaryModel,
      systemMessage: "Return JSON",
      userMessage: "Plan an outline",
      maxOutputTokens: 16000,
    }).catch((error) => error);

    expect(failure.code).toBeUndefined();
    expect(failure.message).toContain("輸出 4096 tokens 後即被部署截斷");
    expect(failure.message).toContain("請改指派其他模型");
  });
});
