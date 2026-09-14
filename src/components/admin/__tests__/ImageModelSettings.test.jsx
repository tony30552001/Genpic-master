import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ImageModelSettings from "../ImageModelSettings";
import {
  createAdminImageModel, deleteAdminImageModel, listAdminImageModels,
  testAdminImageModel, updateAdminImageModel,
} from "../../../services/adminService";
import { waitForImageJob } from "../../../services/aiService";

vi.mock("../../../services/adminService", () => ({
  createAdminImageModel: vi.fn(), deleteAdminImageModel: vi.fn(),
  listAdminImageModels: vi.fn(), testAdminImageModel: vi.fn(), updateAdminImageModel: vi.fn(),
}));
vi.mock("../../../services/aiService", () => ({ waitForImageJob: vi.fn() }));

const qualities = ["low", "medium", "high", "xhigh", "max", "auto"];
const model = {
  modelKey: "future-compatible", label: "Future Compatible",
  apiType: "azure-openai-images-v1", deploymentName: "my-image-deployment",
  endpoint: "https://example.openai.azure.com/openai/v1", hasApiKey: true,
  supportedQualities: ["low", "medium", "high"], defaultQuality: "medium",
};
const catalog = {
  models: [model], apiTypes: [{ id: model.apiType, label: "Azure OpenAI Images v1" }], qualities,
};
const onCatalogChange = vi.fn();
const change = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const openCreate = async () => {
  fireEvent.click(await screen.findByRole("button", { name: "新增圖片模型" }));
  change("模型識別碼", "another-compatible");
  change("顯示名稱", "Another Compatible");
  change("部署名稱", "another-deployment");
  change("Azure HTTPS 端點", model.endpoint);
  change("API 金鑰", "new-test-secret");
};
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

describe("ImageModelSettings", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    listAdminImageModels.mockResolvedValue(catalog);
    onCatalogChange.mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows an empty setup state and retries a failed catalog load", async () => {
    listAdminImageModels.mockRejectedValueOnce(new Error("catalog unavailable"));
    render(<ImageModelSettings onCatalogChange={onCatalogChange} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("catalog unavailable");
    listAdminImageModels.mockResolvedValue({ ...catalog, models: [] });
    fireEvent.click(screen.getByRole("button", { name: "重新載入圖片模型目錄" }));
    expect(await screen.findByText("尚未設定圖片模型，請先新增模型連線。")).toBeInTheDocument();
    expect(testAdminImageModel).not.toHaveBeenCalled();
  });

  it("creates arbitrary compatible metadata with all six qualities without testing or changing policy", async () => {
    createAdminImageModel.mockResolvedValue(catalog);
    render(<ImageModelSettings onCatalogChange={onCatalogChange} />);
    await openCreate();
    for (const quality of ["xhigh", "max", "auto"]) fireEvent.click(screen.getByLabelText(quality));
    change("預設品質", "auto");
    const form = screen.getByRole("form", { name: "新增圖片模型" });
    expect(form.checkValidity()).toBe(true);
    fireEvent.submit(form);
    await screen.findByText("圖片模型已新增；開放清單與預設模型未變更。");
    expect(createAdminImageModel).toHaveBeenCalledWith({
      modelKey: "another-compatible", label: "Another Compatible",
      apiType: model.apiType, deploymentName: "another-deployment", endpoint: model.endpoint,
      apiKey: "new-test-secret", supportedQualities: qualities, defaultQuality: "auto",
    });
    expect(onCatalogChange).toHaveBeenCalledTimes(1);
    expect(testAdminImageModel).not.toHaveBeenCalled();
    expect(screen.queryByDisplayValue("new-test-secret")).not.toBeInTheDocument();
  });

  it("keeps identity immutable and only accepts explicitly entered replacement keys", async () => {
    updateAdminImageModel.mockResolvedValue(catalog);
    render(<ImageModelSettings onCatalogChange={onCatalogChange} />);
    fireEvent.click(await screen.findByRole("button", { name: `編輯 ${model.label}` }));
    expect(screen.getByLabelText("模型識別碼")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("部署名稱")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("API 類型")).toBeDisabled();
    expect(screen.getByLabelText("替換 API 金鑰")).toHaveAttribute("type", "password");
    expect(screen.getByLabelText("替換 API 金鑰")).toHaveValue("");
    change("顯示名稱", "Renamed");
    fireEvent.submit(screen.getByRole("form", { name: "編輯圖片模型" }));
    await screen.findByText("圖片模型已更新。");
    expect(updateAdminImageModel).toHaveBeenLastCalledWith(model.modelKey, expect.objectContaining({
      modelKey: model.modelKey, deploymentName: model.deploymentName, label: "Renamed", apiKey: "",
    }));
    fireEvent.click(screen.getByRole("button", { name: `編輯 ${model.label}` }));
    change("替換 API 金鑰", "replacement-test-secret");
    fireEvent.submit(screen.getByRole("form", { name: "編輯圖片模型" }));
    await screen.findByText("圖片模型已更新。");
    expect(updateAdminImageModel).toHaveBeenLastCalledWith(model.modelKey, expect.objectContaining({ apiKey: "replacement-test-secret" }));
    fireEvent.click(screen.getByRole("button", { name: `編輯 ${model.label}` }));
    expect(screen.getByLabelText("替換 API 金鑰")).toHaveValue("");
    expect(screen.queryByText("replacement-test-secret")).not.toBeInTheDocument();
    expect(testAdminImageModel).not.toHaveBeenCalled();
  });

  it("requires nonempty qualities and an explicit supported default", async () => {
    render(<ImageModelSettings onCatalogChange={onCatalogChange} />);
    await openCreate();
    for (const quality of ["low", "medium", "high"]) fireEvent.click(screen.getByLabelText(quality));
    expect(screen.getByLabelText("預設品質")).toHaveValue("");
    fireEvent.submit(screen.getByRole("form", { name: "新增圖片模型" }));
    expect(screen.getByRole("alert")).toHaveTextContent("請至少選擇一種支援品質");
    expect(createAdminImageModel).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("max"));
    expect(within(screen.getByLabelText("預設品質")).queryByRole("option", { name: "medium" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("預設品質").checkValidity()).toBe(false);
    change("模型識別碼", "INVALID KEY");
    expect(screen.getByLabelText("模型識別碼").checkValidity()).toBe(false);
  });

  it("surfaces save errors, clears submitted secrets, and allows recovery", async () => {
    createAdminImageModel.mockRejectedValueOnce(new Error("invalid endpoint"));
    render(<ImageModelSettings onCatalogChange={onCatalogChange} />);
    await openCreate();
    fireEvent.submit(screen.getByRole("form", { name: "新增圖片模型" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("invalid endpoint");
    expect(screen.getByLabelText("顯示名稱")).toHaveValue("Another Compatible");
    expect(screen.getByLabelText("API 金鑰")).toHaveValue("");
    expect(screen.getByRole("button", { name: "儲存圖片模型" })).toBeEnabled();
    expect(onCatalogChange).not.toHaveBeenCalled();
  });

  it("confirms deletion, reports conflicts, and applies the returned catalog on success", async () => {
    deleteAdminImageModel.mockRejectedValueOnce(new Error("model is in use"));
    render(<ImageModelSettings onCatalogChange={onCatalogChange} />);
    const remove = await screen.findByRole("button", { name: `刪除 ${model.label}` });
    window.confirm.mockReturnValueOnce(false);
    fireEvent.click(remove);
    expect(deleteAdminImageModel).not.toHaveBeenCalled();
    fireEvent.click(remove);
    expect(await screen.findByRole("alert")).toHaveTextContent("model is in use");
    deleteAdminImageModel.mockResolvedValue({ ...catalog, models: [] });
    fireEvent.click(remove);
    await screen.findByText(`已刪除「${model.label}」。`);
    expect(deleteAdminImageModel).toHaveBeenLastCalledWith(model.modelKey);
    expect(onCatalogChange).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: `編輯 ${model.label}` })).not.toBeInTheDocument();
  });

  it("queues a paid test only after confirmation and announces the eventual result", async () => {
    const job = deferred();
    testAdminImageModel.mockResolvedValue({ jobId: "job-1", status: "queued", model: model.modelKey });
    waitForImageJob.mockReturnValue(job.promise);
    render(<ImageModelSettings onCatalogChange={onCatalogChange} />);
    const test = await screen.findByRole("button", { name: `付費生成測試 ${model.label}` });
    expect(testAdminImageModel).not.toHaveBeenCalled();
    window.confirm.mockReturnValueOnce(false);
    fireEvent.click(test);
    expect(testAdminImageModel).not.toHaveBeenCalled();
    fireEvent.click(test);
    expect(window.confirm).toHaveBeenLastCalledWith(expect.stringContaining("Azure 費用"));
    await screen.findByText(/測試已排入佇列（job-1）/);
    expect(testAdminImageModel).toHaveBeenCalledWith({ modelKey: model.modelKey }, { signal: expect.any(AbortSignal) });
    expect(waitForImageJob).toHaveBeenCalledWith({ jobId: "job-1", signal: expect.any(AbortSignal) });
    expect(test).toBeDisabled();
    await act(async () => job.resolve({ status: "succeeded", model: model.modelKey, imageUrl: "https://example.com/test.png" }));
    expect(screen.getByRole("status")).toHaveTextContent("low 品質生成測試成功");
    expect(screen.getByRole("status")).toHaveTextContent("尚未驗證其他品質或圖片編輯能力");
    expect(test).toBeEnabled();
  });

  it.each(["enqueue", "poll"])("reports %s test failures and permits an explicit retry", async (stage) => {
    testAdminImageModel.mockResolvedValue({ jobId: "job-2", model: model.modelKey });
    if (stage === "enqueue") testAdminImageModel.mockRejectedValueOnce(new Error("queue rejected"));
    else waitForImageJob.mockRejectedValueOnce(new Error("generation failed"));
    render(<ImageModelSettings onCatalogChange={onCatalogChange} />);
    const test = await screen.findByRole("button", { name: `付費生成測試 ${model.label}` });
    fireEvent.click(test);
    expect(await screen.findByRole("alert")).toHaveTextContent(stage === "enqueue" ? "queue rejected" : "generation failed");
    expect(screen.getByRole("alert")).toHaveTextContent("重新測試會另行產生費用");
    expect(test).toBeEnabled();
  });

  it("stops local waiting without claiming the remote job was cancelled", async () => {
    const job = deferred();
    testAdminImageModel.mockResolvedValue({ jobId: "job-3", model: model.modelKey });
    waitForImageJob.mockReturnValue(job.promise);
    render(<ImageModelSettings onCatalogChange={onCatalogChange} />);
    fireEvent.click(await screen.findByRole("button", { name: `付費生成測試 ${model.label}` }));
    await waitFor(() => expect(waitForImageJob).toHaveBeenCalled());
    const { signal } = waitForImageJob.mock.calls[0][0];
    fireEvent.click(screen.getByRole("button", { name: "停止等待測試" }));
    expect(signal.aborted).toBe(true);
    expect(screen.getByRole("status")).toHaveTextContent("遠端工作未取消");
    await act(async () => job.resolve({ status: "succeeded" }));
    expect(screen.getByRole("status")).toHaveTextContent("遠端工作未取消");
  });

  it("aborts an in-flight submission on unmount and never starts polling its late response", async () => {
    const queued = deferred();
    testAdminImageModel.mockReturnValue(queued.promise);
    const { unmount } = render(<ImageModelSettings onCatalogChange={onCatalogChange} />);
    fireEvent.click(await screen.findByRole("button", { name: `付費生成測試 ${model.label}` }));
    const { signal } = testAdminImageModel.mock.calls[0][1];
    unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => queued.resolve({ jobId: "late-job" }));
    expect(waitForImageJob).not.toHaveBeenCalled();
  });

  it("disables low-quality tests for saved models without low support", async () => {
    listAdminImageModels.mockResolvedValue({ ...catalog, models: [{ ...model, supportedQualities: ["max"], defaultQuality: "max" }] });
    render(<ImageModelSettings onCatalogChange={onCatalogChange} />);
    expect(await screen.findByRole("button", { name: `付費生成測試 ${model.label}` })).toBeDisabled();
    expect(screen.getByText(/未設定支援 low 品質/)).toBeInTheDocument();
    expect(testAdminImageModel).not.toHaveBeenCalled();
  });

  it("distinguishes successful catalog writes from policy reload failures", async () => {
    createAdminImageModel.mockResolvedValue(catalog);
    onCatalogChange.mockRejectedValueOnce(new Error("settings unavailable"));
    render(<ImageModelSettings onCatalogChange={onCatalogChange} />);
    await openCreate();
    fireEvent.submit(screen.getByRole("form", { name: "新增圖片模型" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("目錄已儲存，但政策或使用者資料重新載入失敗");
    expect(screen.getByRole("status")).toHaveTextContent("圖片模型已新增");
  });
});
