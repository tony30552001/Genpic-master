import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chooseOption } from "../../../test/selectHelpers";

import AiModelSettings from "../models/AiModelSettings";
import {
  assignAdminLlmRole,
  createAdminImageModel,
  deleteAdminImageModel,
  getAdminModelSettings,
  listAdminImageModels,
  listAdminLlmModels,
  testAdminImageModel,
  testAdminLlmModel,
  updateAdminImageModel,
  updateAdminModelSettings,
} from "../../../services/adminService";
import { waitForImageJob } from "../../../services/aiService";

vi.mock("../../../services/adminService", () => ({
  assignAdminLlmRole: vi.fn(),
  createAdminImageModel: vi.fn(),
  createAdminLlmModel: vi.fn(),
  deleteAdminImageModel: vi.fn(),
  deleteAdminLlmModel: vi.fn(),
  getAdminModelSettings: vi.fn(),
  listAdminImageModels: vi.fn(),
  listAdminLlmModels: vi.fn(),
  testAdminImageModel: vi.fn(),
  testAdminLlmModel: vi.fn(),
  updateAdminImageModel: vi.fn(),
  updateAdminLlmModel: vi.fn(),
  updateAdminModelSettings: vi.fn(),
}));
vi.mock("../../../services/aiService", () => ({ waitForImageJob: vi.fn() }));

const { refreshProfile } = vi.hoisted(() => ({ refreshProfile: vi.fn() }));
vi.mock("../../../hooks/useAuth", () => ({ default: () => ({ refreshProfile }) }));

const imageModel = (modelKey, label, extra = {}) => ({
  modelKey, label, apiType: "azure-openai-images-v1", deploymentName: `${modelKey}-deploy`,
  endpoint: "https://example.openai.azure.com", hasApiKey: true,
  supportedQualities: ["low", "medium", "high"], defaultQuality: "medium", ...extra,
});
const alpha = imageModel("alpha", "Alpha");
const beta = imageModel("beta", "Beta");
const catalogOf = (models) => ({
  models,
  apiTypes: [{ id: "azure-openai-images-v1", label: "Azure OpenAI Images v1" }],
  qualities: ["low", "medium", "high", "auto"],
});
const policyOf = (modelPolicy) => ({ modelPolicy });

const textModel = { id: "llm-1", label: "GPT 分析", modelName: "gpt-x", endpoint: "https://llm.example.com", hasApiKey: true };
const llmSettings = {
  models: [textModel],
  assignments: [],
  roles: [{ id: "style_analysis", label: "風格分析", description: "從參考圖萃取風格描述與標籤" }],
};

const renderPage = async () => {
  const user = userEvent.setup();
  render(<AiModelSettings />);
  await screen.findByLabelText("圖片生成模型");
  await screen.findByLabelText("風格分析主要模型");
  return user;
};

describe("AiModelSettings", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    refreshProfile.mockResolvedValue(undefined);
    listAdminImageModels.mockResolvedValue(catalogOf([alpha, beta]));
    getAdminModelSettings.mockResolvedValue(policyOf({ allowedModels: ["alpha", "beta"], defaultModel: "alpha", defaultEditModel: "alpha" }));
    updateAdminModelSettings.mockImplementation(async (policy) => policyOf(policy));
    listAdminLlmModels.mockResolvedValue(llmSettings);
  });

  it("saves an image role assignment immediately and refreshes the profile", async () => {
    const user = await renderPage();
    await chooseOption("圖片編輯模型", "Beta", user);

    await waitFor(() => expect(updateAdminModelSettings).toHaveBeenCalledWith({
      allowedModels: ["alpha", "beta"], defaultModel: "alpha", defaultEditModel: "beta",
    }));
    expect(await screen.findByRole("status")).toHaveTextContent("模型政策已儲存");
    expect(refreshProfile).toHaveBeenCalledTimes(1);
  });

  it("keeps default models open and saves when another model is closed", async () => {
    const user = await renderPage();
    expect(screen.getByRole("switch", { name: "開放 Alpha" })).toBeDisabled();
    expect(screen.getByRole("switch", { name: "開放 Alpha" })).toHaveAccessibleDescription("圖片生成、圖片編輯使用中，無法關閉");

    await user.click(screen.getByRole("switch", { name: "開放 Beta" }));
    await waitFor(() => expect(updateAdminModelSettings).toHaveBeenCalledWith({
      allowedModels: ["alpha"], defaultModel: "alpha", defaultEditModel: "alpha",
    }));
    expect(screen.getByRole("switch", { name: "開放 Beta" })).toHaveAttribute("aria-checked", "false");
  });

  it("does not save a policy that references an unregistered model until it is removed", async () => {
    getAdminModelSettings.mockResolvedValue(policyOf({ allowedModels: ["alpha", "ghost"], defaultModel: "alpha", defaultEditModel: "alpha" }));
    const user = await renderPage();
    expect(screen.getByText(/開放清單引用了未登錄的模型/)).toBeInTheDocument();

    await chooseOption("圖片編輯模型", "Beta", user);
    expect(updateAdminModelSettings).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "移除未登錄模型 ghost" }));
    await waitFor(() => expect(updateAdminModelSettings).toHaveBeenCalledWith({
      allowedModels: ["alpha", "beta"], defaultModel: "alpha", defaultEditModel: "beta",
    }));
  });

  it("reverts the draft and reports a rejected policy save", async () => {
    updateAdminModelSettings.mockRejectedValue(new Error("政策無效"));
    const user = await renderPage();
    await chooseOption("圖片生成模型", "Beta", user);

    expect(await screen.findByRole("alert")).toHaveTextContent("政策無效");
    expect(screen.getByLabelText("圖片生成模型")).toHaveTextContent("Alpha");
  });

  it("creates an image model from the dialog with every field", async () => {
    createAdminImageModel.mockResolvedValue(catalogOf([alpha, beta, imageModel("gamma", "Gamma")]));
    const user = await renderPage();
    await user.click(screen.getByRole("button", { name: "新增模型" }));
    await user.click(await screen.findByRole("menuitem", { name: "圖片模型" }));

    const form = await screen.findByRole("form", { name: "新增圖片模型" });
    await user.type(within(form).getByLabelText("模型識別碼"), "gamma");
    await user.type(within(form).getByLabelText("顯示名稱"), "Gamma");
    await user.type(within(form).getByLabelText("部署名稱"), "gamma-deploy");
    await user.type(within(form).getByLabelText("Azure HTTPS 端點"), "https://gamma.openai.azure.com");
    await user.type(within(form).getByLabelText("API 金鑰"), "secret");
    await user.click(within(form).getByRole("button", { name: "儲存圖片模型" }));

    await waitFor(() => expect(createAdminImageModel).toHaveBeenCalledWith({
      modelKey: "gamma", label: "Gamma", apiType: "azure-openai-images-v1", deploymentName: "gamma-deploy",
      endpoint: "https://gamma.openai.azure.com", apiKey: "secret",
      supportedQualities: ["low", "medium", "high"], defaultQuality: "medium",
    }));
    await waitFor(() => expect(screen.queryByRole("form", { name: "新增圖片模型" })).toBeNull());
    expect(refreshProfile).toHaveBeenCalledTimes(1);
  });

  it("requires a supported default quality before saving", async () => {
    const user = await renderPage();
    await user.click(screen.getByRole("button", { name: "編輯 Alpha" }));
    const form = await screen.findByRole("form", { name: "編輯圖片模型" });
    for (const quality of ["low", "medium", "high"]) {
      await user.click(within(form).getByRole("checkbox", { name: quality }));
    }
    fireEvent.submit(form);

    expect(await within(form).findByRole("alert")).toHaveTextContent("請至少選擇一種支援品質");
    expect(updateAdminImageModel).not.toHaveBeenCalled();
  });

  it("keeps the identity fixed and the key empty when editing", async () => {
    updateAdminImageModel.mockResolvedValue(catalogOf([{ ...alpha, label: "Alpha 2" }, beta]));
    const user = await renderPage();
    await user.click(screen.getByRole("button", { name: "編輯 Alpha" }));
    const form = await screen.findByRole("form", { name: "編輯圖片模型" });

    expect(within(form).getByLabelText("模型識別碼")).toHaveAttribute("readonly");
    expect(within(form).getByLabelText("部署名稱")).toHaveAttribute("readonly");
    expect(within(form).getByLabelText("API 類型")).toBeDisabled();
    expect(within(form).getByLabelText("替換 API 金鑰")).toHaveValue("");

    await user.clear(within(form).getByLabelText("顯示名稱"));
    await user.type(within(form).getByLabelText("顯示名稱"), "Alpha 2");
    await user.click(within(form).getByRole("button", { name: "儲存圖片模型" }));
    await waitFor(() => expect(updateAdminImageModel).toHaveBeenCalledWith("alpha", expect.objectContaining({ label: "Alpha 2", apiKey: "" })));
  });

  it("confirms before deleting and shows a rejected deletion", async () => {
    deleteAdminImageModel.mockRejectedValue(new Error("模型仍被政策引用"));
    const user = await renderPage();
    await user.click(screen.getByRole("button", { name: "刪除 Beta" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(deleteAdminImageModel).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "刪除" }));

    expect(deleteAdminImageModel).toHaveBeenCalledWith("beta");
    expect(await screen.findByRole("alert")).toHaveTextContent("模型仍被政策引用");
  });

  it("runs a paid test only after confirmation and reports its limited scope", async () => {
    testAdminImageModel.mockResolvedValue({ jobId: "job-1" });
    waitForImageJob.mockResolvedValue({ status: "succeeded" });
    const user = await renderPage();
    await user.click(screen.getByRole("button", { name: "付費生成測試 Alpha" }));
    expect(testAdminImageModel).not.toHaveBeenCalled();

    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "送出測試" }));

    expect(await screen.findByText(/low 品質生成測試成功/)).toBeInTheDocument();
    expect(screen.getByText(/尚未驗證其他品質或圖片編輯能力/)).toBeInTheDocument();
    expect(waitForImageJob).toHaveBeenCalledWith(expect.objectContaining({ jobId: "job-1" }));
  });

  it("stops waiting for a paid test without claiming the remote job was cancelled", async () => {
    testAdminImageModel.mockResolvedValue({ jobId: "job-1" });
    waitForImageJob.mockImplementation(({ signal }) => new Promise((_, reject) => {
      signal.addEventListener("abort", () => reject(new Error("aborted")));
    }));
    const user = await renderPage();
    await user.click(screen.getByRole("button", { name: "付費生成測試 Alpha" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "送出測試" }));
    await user.click(await screen.findByRole("button", { name: "停止等待測試" }));

    expect(await screen.findByText(/遠端工作未取消/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "付費生成測試 Alpha" })).toBeEnabled();
  });

  it("warns that a failed paid test costs again on retry", async () => {
    testAdminImageModel.mockResolvedValue({ jobId: "job-1" });
    waitForImageJob.mockRejectedValue(new Error("部署不存在"));
    const user = await renderPage();
    await user.click(screen.getByRole("button", { name: "付費生成測試 Alpha" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "送出測試" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("部署不存在。重新測試會另行產生費用。");
  });

  it("assigns a text model to a role and shows a failed connection test", async () => {
    assignAdminLlmRole.mockResolvedValue({ ...llmSettings, assignments: [{ role: "style_analysis", modelId: "llm-1", fallbackModelId: null }] });
    testAdminLlmModel.mockResolvedValue({ success: false, message: "金鑰無效" });
    const user = await renderPage();

    await chooseOption("風格分析主要模型", "GPT 分析（gpt-x）", user);
    await waitFor(() => expect(assignAdminLlmRole).toHaveBeenCalledWith("style_analysis", { modelId: "llm-1", fallbackModelId: null }));

    await user.click(screen.getByRole("button", { name: "測試 GPT 分析" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("金鑰無效");
  });

  it("retries a failed image settings load", async () => {
    listAdminImageModels.mockRejectedValueOnce(new Error("網路錯誤"));
    const user = userEvent.setup();
    render(<AiModelSettings />);

    const [retry] = await screen.findAllByRole("button", { name: "重新載入圖片模型設定" });
    await user.click(retry);
    expect(await screen.findByLabelText("圖片生成模型")).toHaveTextContent("Alpha");
  });
});
