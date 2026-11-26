import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const { generateJson } = require("../llmRuntime");

const azureModel = {
  id: "model-azure",
  modelName: "gpt-document-analysis",
  endpoint: "https://pixora.services.ai.azure.com/openai/v1",
  apiKey: "azure-key",
};

const backupModel = {
  id: "model-backup",
  modelName: "gpt-backup",
  endpoint: "https://backup.services.ai.azure.com/openai/v1",
  apiKey: "backup-key",
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

const truncatedResponse = () =>
  new Response(
    JSON.stringify({
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
      output: [{ type: "reasoning", summary: [] }],
      usage: {
        output_tokens: 32000,
        output_tokens_details: { reasoning_tokens: 7998 },
      },
    }),
    { status: 200 }
  );

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
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

  it("fails over to the backup model with a smaller budget after a 429", async () => {
    vi.useFakeTimers();

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(peakLoadResponse())
      .mockResolvedValueOnce(jsonResponse({ svg: "<svg></svg>" }));

    const pending = generateJson({
      llm: { model: azureModel, fallback: backupModel },
      systemMessage: "Author one slide",
      userMessage: "Slide 1",
      maxOutputTokens: 16000,
    });
    await vi.advanceTimersByTimeAsync(30000);
    const result = await pending;

    expect(result.svg).toBe("<svg></svg>");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, backupCall] = fetchMock.mock.calls;
    expect(backupCall[0]).toContain("backup.services.ai.azure.com");
    expect(JSON.parse(backupCall[1].body)).toMatchObject({
      model: "gpt-backup",
      max_output_tokens: 9600,
    });
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

  /**
   * A reasoning model can spend the whole budget on reasoning and answer with
   * HTTP 200 and no content, so the retry has to grow the budget.
   */
  it("grows the output budget when the model truncates before answering", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(truncatedResponse())
      .mockResolvedValueOnce(jsonResponse({ slides: [] }));

    const result = await generateJson({
      llm: { model: azureModel, fallback: backupModel },
      systemMessage: "Plan an outline",
      userMessage: "Deck",
      maxOutputTokens: 16000,
    });

    expect(result.slides).toEqual([]);
    const budgets = fetchMock.mock.calls.map(
      ([, options]) => JSON.parse(options.body).max_output_tokens
    );
    expect(budgets).toEqual([16000, 32000]);
  });

  it("streams a JSON reply with its reasoning summary and restarts the stream on retry", async () => {
    const sse = (events) =>
      new Response(
        events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
        { status: 200 }
      );
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        sse([
          { type: "response.reasoning_summary_text.delta", delta: "先想" },
          { type: "response.incomplete", response: { incomplete_details: { reason: "max_output_tokens" } } },
        ])
      )
      .mockResolvedValueOnce(
        sse([
          { type: "response.reasoning_summary_text.delta", delta: "規劃三幕" },
          { type: "response.output_text.delta", delta: '{"title":"[連結](https://example.com)",' },
          { type: "response.output_text.delta", delta: '"shots":[]}' },
          { type: "response.completed" },
        ])
      );
    const events = [];

    const result = await generateJson({
      llm: { model: azureModel, fallback: null },
      systemMessage: "Return JSON",
      userMessage: "Draft",
      maxOutputTokens: 16000,
      onTextDelta: (text) => events.push(["text", text]),
      onReasoningDelta: (text) => events.push(["reasoning", text]),
      onRetry: () => events.push(["retry"]),
    });

    expect(result).toEqual({ title: "[連結](https://example.com)", shots: [] });
    expect(events.map(([type]) => type)).toEqual(["reasoning", "retry", "reasoning", "text", "text"]);
    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body).toMatchObject({
      stream: true,
      text: { format: { type: "json_object" } },
      reasoning: { summary: "auto" },
      max_output_tokens: 32000,
      input: [{ role: "user", content: "Draft" }],
    });
    expect(body).not.toHaveProperty("tools");
    expect(body).not.toHaveProperty("tool_choice");
  });

  it("stops growing at the ceiling and reports why the model produced nothing", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => truncatedResponse());

    await expect(
      generateJson({
        llm: { model: azureModel },
        systemMessage: "Plan an outline",
        userMessage: "Deck",
        maxOutputTokens: 32000,
      })
    ).rejects.toThrow("未在輸出上限 32000 內完成回應（max_output_tokens");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("does not retry rejections the request itself caused", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "Invalid prompt" } }), {
        status: 400,
      })
    );

    await expect(
      generateJson({
        llm: { model: azureModel, fallback: backupModel },
        systemMessage: "Author one slide",
        userMessage: "Slide 1",
      })
    ).rejects.toThrow("Invalid prompt (400)");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("rejects a model that is missing its endpoint", async () => {
    await expect(
      generateJson({
        llm: { model: { ...azureModel, endpoint: "" } },
        systemMessage: "Return JSON",
        userMessage: "Analyze",
      })
    ).rejects.toThrow("主要分析模型缺少 Azure OpenAI 端點");
  });
});
