import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import LlmModelSettings from "../LlmModelSettings";
import {
  assignAdminLlmRole,
  createAdminLlmModel,
  deleteAdminLlmModel,
  listAdminLlmModels,
  testAdminLlmModel,
} from "../../../services/adminService";

vi.mock("../../../services/adminService", () => ({
  assignAdminLlmRole: vi.fn(),
  createAdminLlmModel: vi.fn(),
  deleteAdminLlmModel: vi.fn(),
  listAdminLlmModels: vi.fn(),
  testAdminLlmModel: vi.fn(),
  updateAdminLlmModel: vi.fn(),
}));

const providers = [
  {
    id: "azure-openai",
    label: "Azure OpenAI",
    requiresEndpoint: true,
    endpointHint: "https://<resource>.openai.azure.com",
  },
  { id: "google-gemini", label: "Google Gemini", requiresEndpoint: false, endpointHint: "" },
];

const roles = [
  {
    id: "document_analysis",
    label: "文件分析",
    description: "上傳文件後拆解場景與重點",
  },
  {
    id: "style_analysis",
    label: "風格分析",
    description: "從參考圖萃取風格描述與標籤",
  },
];

const models = [
  {
    id: "model-azure",
    label: "GPT 分析",
    provider: "azure-openai",
    modelName: "gpt-5.6-luna",
    endpoint: "https://pixora.openai.azure.com/openai/v1",
    hasApiKey: true,
  },
  {
    id: "model-gemini",
    label: "Flash 分析",
    provider: "google-gemini",
    modelName: "gemini-2.0-flash",
    endpoint: "",
    hasApiKey: true,
  },
];

const settings = { models, roles, providers, assignments: [] };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  listAdminLlmModels.mockResolvedValue(settings);
});

const renderSettings = async () => {
  render(<LlmModelSettings />);
  await screen.findByText("GPT 分析", { selector: "p" });
};

describe("LlmModelSettings", () => {
  it("explains why role assignment is unavailable before any model exists", async () => {
    listAdminLlmModels.mockResolvedValue({ ...settings, models: [] });
    render(<LlmModelSettings />);

    expect(
      await screen.findByText("尚未建立任何分析模型，請點右上角「新增模型」開始設定。")
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("尚未建立任何分析模型，請先於上方新增。")
    ).toHaveLength(2);
    expect(screen.queryByLabelText("文件分析主要模型")).not.toBeInTheDocument();
  });

  it("keeps the fallback selector out of the way until a primary model is assigned", async () => {
    listAdminLlmModels.mockResolvedValue({
      ...settings,
      assignments: [
        { role: "document_analysis", modelId: "model-azure", fallbackModelId: null },
      ],
    });
    await renderSettings();

    expect(screen.getAllByText("請先指派主要模型。")).toHaveLength(1);
    expect(screen.getByLabelText("文件分析備援模型")).toBeInTheDocument();
  });

  it("lists saved models without exposing their keys", async () => {
    await renderSettings();

    expect(
      screen.getByText("Azure OpenAI ・ gpt-5.6-luna ・ https://pixora.openai.azure.com/openai/v1")
    ).toBeInTheDocument();
    expect(screen.getByText("Google Gemini ・ gemini-2.0-flash")).toBeInTheDocument();
  });

  it("offers every model to every role regardless of provider", async () => {
    await renderSettings();

    const documentSelect = screen.getByLabelText("文件分析主要模型");
    const styleSelect = screen.getByLabelText("風格分析主要模型");
    const expected = [
      "未指派",
      "GPT 分析（Azure OpenAI）",
      "Flash 分析（Google Gemini）",
    ];

    expect(Array.from(documentSelect.options).map((option) => option.textContent)).toEqual(
      expected
    );
    expect(Array.from(styleSelect.options).map((option) => option.textContent)).toEqual(
      expected
    );
  });

  it("hides the endpoint field for providers that do not need one", async () => {
    await renderSettings();

    fireEvent.click(screen.getByRole("button", { name: "新增模型" }));
    expect(screen.getByLabelText("端點")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("供應商"), {
      target: { value: "google-gemini" },
    });
    expect(screen.queryByLabelText("端點")).not.toBeInTheDocument();
  });

  it("creates a model and refreshes the settings from the response", async () => {
    const created = {
      ...settings,
      models: [...models, { id: "model-new", label: "新模型", provider: "google-gemini", modelName: "gemini-3", endpoint: "", hasApiKey: true }],
    };
    createAdminLlmModel.mockResolvedValue(created);
    await renderSettings();

    fireEvent.click(screen.getByRole("button", { name: "新增模型" }));
    fireEvent.change(screen.getByLabelText("供應商"), {
      target: { value: "google-gemini" },
    });
    fireEvent.change(screen.getByLabelText("名稱"), { target: { value: "新模型" } });
    fireEvent.change(screen.getByLabelText("模型／部署名稱"), {
      target: { value: "gemini-3" },
    });
    fireEvent.change(screen.getByLabelText("API 金鑰"), {
      target: { value: "super-secret" },
    });
    const submitButton = screen
      .getAllByRole("button", { name: "新增模型" })
      .find((button) => button.getAttribute("type") === "submit");
    fireEvent.click(submitButton);

    await waitFor(() =>
      expect(createAdminLlmModel).toHaveBeenCalledWith({
        label: "新模型",
        provider: "google-gemini",
        modelName: "gemini-3",
        endpoint: "",
        apiKey: "super-secret",
      })
    );
    expect(await screen.findByText("模型已新增")).toBeInTheDocument();
    expect(screen.getByText("新模型", { selector: "p" })).toBeInTheDocument();
  });

  it("surfaces a failed connectivity test", async () => {
    testAdminLlmModel.mockResolvedValue({ success: false, message: "金鑰無效" });
    await renderSettings();

    fireEvent.click(screen.getAllByRole("button", { name: /測試/ })[0]);

    await waitFor(() => expect(testAdminLlmModel).toHaveBeenCalledWith({ modelId: "model-azure" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("金鑰無效");
  });

  it("saves a role assignment", async () => {
    assignAdminLlmRole.mockResolvedValue({
      ...settings,
      assignments: [
        { role: "document_analysis", modelId: "model-azure", fallbackModelId: null },
      ],
    });
    await renderSettings();

    fireEvent.change(screen.getByLabelText("文件分析主要模型"), {
      target: { value: "model-azure" },
    });

    await waitFor(() =>
      expect(assignAdminLlmRole).toHaveBeenCalledWith("document_analysis", {
        modelId: "model-azure",
        fallbackModelId: null,
      })
    );
    expect(await screen.findByRole("status")).toHaveTextContent("文件分析");
  });

  it("saves a cross-provider role assignment", async () => {
    assignAdminLlmRole.mockResolvedValue({
      ...settings,
      assignments: [
        { role: "document_analysis", modelId: "model-gemini", fallbackModelId: null },
      ],
    });
    await renderSettings();

    fireEvent.change(screen.getByLabelText("文件分析主要模型"), {
      target: { value: "model-gemini" },
    });

    await waitFor(() =>
      expect(assignAdminLlmRole).toHaveBeenCalledWith("document_analysis", {
        modelId: "model-gemini",
        fallbackModelId: null,
      })
    );
  });

  it("reports a delete that the backend rejects", async () => {
    deleteAdminLlmModel.mockRejectedValue(new Error("模型仍被「文件分析」使用"));
    await renderSettings();

    fireEvent.click(screen.getAllByRole("button", { name: /刪除/ })[0]);

    expect(await screen.findByRole("alert")).toHaveTextContent("模型仍被「文件分析」使用");
  });
});
