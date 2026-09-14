import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AdminPanel from "../AdminPanel";
import {
  getAdminHistoryImage,
  getAdminModelSettings,
  listAdminImageModels,
  createAdminImageModel,
  listAdminHistory,
  listAdminStyles,
  listAdminUserOptions,
  listAdminUsers,
  updateAdminModelSettings,
  updateAdminImageModel,
} from "../../../services/adminService";

vi.mock("../../../services/adminService", () => ({
  listAdminImageModels: vi.fn(),
  createAdminImageModel: vi.fn(),
  updateAdminImageModel: vi.fn(),
  deleteAdminImageModel: vi.fn(),
  testAdminImageModel: vi.fn(),
  assignAdminLlmRole: vi.fn(),
  createAdminLlmModel: vi.fn(),
  deleteAdminLlmModel: vi.fn(),
  deleteAdminStyle: vi.fn(),
  getAdminHistoryImage: vi.fn(),
  getAdminModelSettings: vi.fn(),
  getAdminStylePreview: vi.fn(),
  listAdminHistory: vi.fn(),
  listAdminLlmModels: vi.fn(),
  listAdminStyles: vi.fn(),
  listAdminUsers: vi.fn(),
  listAdminUserOptions: vi.fn(),
  testAdminLlmModel: vi.fn(),
  updateAdminLlmModel: vi.fn(),
  updateAdminModelSettings: vi.fn(),
  updateAdminUserRole: vi.fn(),
  updateAdminUserStatus: vi.fn(),
}));

const { refreshProfile } = vi.hoisted(() => ({ refreshProfile: vi.fn() }));
vi.mock("../../../hooks/useAuth", () => ({
  default: () => ({
    user: { email: "admin@example.com" },
    profile: { displayName: "管理員", role: "admin" },
    handleLogout: vi.fn(),
    refreshProfile,
  }),
}));

const emptyPage = { items: [], pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 } };
const model = {
  modelKey: "custom-image", label: "Custom Image", apiType: "azure-openai-images-v1",
  supportedQualities: ["low", "medium", "high"], defaultQuality: "medium",
};
const catalog = {
  models: [{ ...model, deploymentName: "deployment", endpoint: "https://example.openai.azure.com", hasApiKey: true }],
  apiTypes: [{ id: model.apiType, label: "Azure OpenAI Images v1" }],
  qualities: ["low", "medium", "high", "xhigh", "max", "auto"],
};

const renderPanel = () =>
  render(
    <MemoryRouter>
      <AdminPanel />
    </MemoryRouter>
  );

describe("AdminPanel section loading", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    listAdminUsers.mockResolvedValue({
      items: [
        {
          id: "user-1",
          email: "alice@example.com",
          displayName: "Alice",
          role: "viewer",
          isActive: true,
          createdAt: { seconds: 1700000000 },
          generationCount: 2,
          styleCount: 1,
        },
      ],
      pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
    });
    listAdminHistory.mockResolvedValue(emptyPage);
    listAdminStyles.mockResolvedValue(emptyPage);
    listAdminUserOptions.mockResolvedValue([]);
    getAdminHistoryImage.mockResolvedValue({ imageUrl: "" });
    listAdminImageModels.mockResolvedValue(catalog);
    refreshProfile.mockResolvedValue(undefined);
    getAdminModelSettings.mockResolvedValue({
      modelPolicy: { allowedModels: [model.modelKey], defaultModel: model.modelKey },
      models: [model],
    });
  });

  it("only loads the users section on mount", async () => {
    renderPanel();

    await screen.findByText("alice@example.com");

    expect(listAdminUsers).toHaveBeenCalledTimes(1);
    expect(listAdminHistory).not.toHaveBeenCalled();
    expect(listAdminStyles).not.toHaveBeenCalled();
    expect(getAdminModelSettings).not.toHaveBeenCalled();
    expect(listAdminImageModels).not.toHaveBeenCalled();
  });

  it("loads a section once when it is first opened", async () => {
    renderPanel();
    await screen.findByText("alice@example.com");

    fireEvent.click(screen.getByRole("button", { name: "生成紀錄" }));
    await waitFor(() => expect(listAdminHistory).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "使用者" }));
    fireEvent.click(screen.getByRole("button", { name: "生成紀錄" }));

    await screen.findByText("目前沒有生成紀錄。");
    expect(listAdminHistory).toHaveBeenCalledTimes(1);
    expect(listAdminUsers).toHaveBeenCalledTimes(1);
    expect(listAdminImageModels).not.toHaveBeenCalled();
  });

  it("only permits an explicitly chosen allowed registered default and refreshes the profile", async () => {
    renderPanel();
    await screen.findByText("alice@example.com");
    fireEvent.click(screen.getByRole("button", { name: "模型政策" }));
    const allowed = await screen.findByRole("button", { name: /Custom Image custom-image/ });
    const select = screen.getByLabelText("預設生成模型");
    const save = screen.getByRole("button", { name: "儲存模型政策" });
    fireEvent.click(allowed);
    expect(select).toHaveValue("");
    expect(save).toBeDisabled();
    expect(within(select).queryByRole("option", { name: model.label })).not.toBeInTheDocument();
    fireEvent.click(allowed);
    expect(save).toBeDisabled();
    fireEvent.change(select, { target: { value: model.modelKey } });
    updateAdminModelSettings.mockResolvedValue({
      modelPolicy: { allowedModels: [model.modelKey], defaultModel: model.modelKey }, models: [model],
    });
    fireEvent.click(save);
    await screen.findByText("模型政策已更新，下一次生成將套用新設定。");
    expect(updateAdminModelSettings).toHaveBeenCalledWith({ allowedModels: [model.modelKey], defaultModel: model.modelKey });
    expect(refreshProfile).toHaveBeenCalledTimes(1);
  });

  it("can register an existing bootstrap policy key without changing its default", async () => {
    const policy = { allowedModels: ["gpt-image-2"], defaultModel: "gpt-image-2" };
    getAdminModelSettings.mockResolvedValue({ modelPolicy: policy, models: [] });
    listAdminImageModels.mockResolvedValue({ ...catalog, models: [] });
    renderPanel();
    await screen.findByText("alice@example.com");
    fireEvent.click(screen.getByRole("button", { name: "模型政策" }));
    await screen.findByText(/需要設定圖片模型/);
    expect(screen.getByRole("button", { name: "儲存模型政策" })).toBeDisabled();
    fireEvent.click(await screen.findByRole("button", { name: "新增圖片模型" }));
    const registered = { ...catalog.models[0], modelKey: "gpt-image-2" };
    createAdminImageModel.mockResolvedValue({ ...catalog, models: [registered] });
    getAdminModelSettings.mockResolvedValue({ modelPolicy: policy, models: [registered] });
    fireEvent.change(screen.getByLabelText("模型識別碼"), { target: { value: registered.modelKey } });
    fireEvent.change(screen.getByLabelText("顯示名稱"), { target: { value: registered.label } });
    fireEvent.change(screen.getByLabelText("部署名稱"), { target: { value: registered.deploymentName } });
    fireEvent.change(screen.getByLabelText("Azure HTTPS 端點"), { target: { value: registered.endpoint } });
    fireEvent.change(screen.getByLabelText("API 金鑰"), { target: { value: "test-secret" } });
    fireEvent.submit(screen.getByRole("form", { name: "新增圖片模型" }));
    await waitFor(() => expect(screen.getByLabelText("預設生成模型")).toHaveValue("gpt-image-2"));
    expect(getAdminModelSettings).toHaveBeenCalledTimes(2);
    expect(updateAdminModelSettings).not.toHaveBeenCalled();
  });

  it("reports policy loading and save failures with recovery", async () => {
    getAdminModelSettings.mockRejectedValueOnce(new Error("policy unavailable"));
    renderPanel();
    await screen.findByText("alice@example.com");
    fireEvent.click(screen.getByRole("button", { name: "模型政策" }));
    fireEvent.click(await screen.findByRole("button", { name: "重新載入政策" }));
    const save = await screen.findByRole("button", { name: "儲存模型政策" });
    await waitFor(() => expect(save).toBeEnabled());
    updateAdminModelSettings.mockRejectedValueOnce(new Error("policy conflict"));
    fireEvent.click(save);
    expect(await screen.findByRole("alert")).toHaveTextContent("policy conflict");
    expect(refreshProfile).not.toHaveBeenCalled();
  });

  it.each([null, "profile", "policy"])("refreshes profile capabilities after a catalog update, including %s refresh failures", async (failure) => {
    const policy = { allowedModels: [model.modelKey], defaultModel: model.modelKey };
    const updatedModel = { ...catalog.models[0], supportedQualities: catalog.qualities, defaultQuality: "max" };
    updateAdminImageModel.mockResolvedValue({ ...catalog, models: [updatedModel] });
    renderPanel();
    await screen.findByText("alice@example.com");
    fireEvent.click(screen.getByRole("button", { name: "模型政策" }));
    fireEvent.click(await screen.findByRole("button", { name: `編輯 ${model.label}` }));
    for (const quality of ["xhigh", "max", "auto"]) fireEvent.click(screen.getByLabelText(quality));
    fireEvent.change(screen.getByLabelText("預設品質"), { target: { value: "max" } });
    getAdminModelSettings.mockResolvedValue({ modelPolicy: policy, models: [updatedModel] });
    if (failure === "profile") refreshProfile.mockRejectedValueOnce(new Error("profile unavailable"));
    if (failure === "policy") getAdminModelSettings.mockRejectedValueOnce(new Error("policy unavailable"));
    fireEvent.submit(screen.getByRole("form", { name: "編輯圖片模型" }));
    await screen.findByText("圖片模型已更新。");
    expect(updateAdminImageModel).toHaveBeenCalledWith(model.modelKey, expect.objectContaining({
      supportedQualities: catalog.qualities, defaultQuality: "max",
    }));
    await waitFor(() => expect(refreshProfile).toHaveBeenCalledTimes(1));
    expect(getAdminModelSettings).toHaveBeenCalledTimes(2);
    expect(updateAdminModelSettings).not.toHaveBeenCalled();
    if (failure) {
      expect(await screen.findByText(/目錄已儲存，但政策或使用者資料重新載入失敗/)).toHaveTextContent(`${failure} unavailable`);
      expect(screen.getByText("圖片模型已更新。")).toBeInTheDocument();
    } else {
      expect(screen.getByLabelText("預設生成模型")).toHaveValue(model.modelKey);
    }
  });

  it("allows long dynamic policy labels and keys to wrap within the grid", async () => {
    const longModel = { ...model, modelKey: "k".repeat(128), label: "L".repeat(128) };
    getAdminModelSettings.mockResolvedValue({
      modelPolicy: { allowedModels: [longModel.modelKey], defaultModel: longModel.modelKey },
      models: [longModel],
    });
    renderPanel();
    await screen.findByText("alice@example.com");
    fireEvent.click(screen.getByRole("button", { name: "模型政策" }));
    const toggle = await screen.findByRole("button", { name: `${longModel.label} ${longModel.modelKey}` });
    expect(toggle).toHaveClass("min-w-0");
    const textContainer = within(toggle).getByText(longModel.label).parentElement;
    expect(textContainer).toHaveClass("min-w-0", "flex-1", "[overflow-wrap:anywhere]");
    expect(within(textContainer).getByText(longModel.modelKey)).toBeInTheDocument();
  });

  it("reloads the filtered sections when the user filter changes", async () => {
    listAdminUserOptions.mockResolvedValue([
      {
        id: "user-1",
        email: "alice@example.com",
        displayName: "Alice",
        role: "viewer",
        isActive: true,
        authProvider: "entra",
      },
      {
        id: "user-2",
        email: "bob@example.com",
        displayName: "Bob",
        role: "viewer",
        isActive: true,
        authProvider: "google",
      },
    ]);

    renderPanel();
    await screen.findByText("alice@example.com");

    fireEvent.click(screen.getByRole("button", { name: "生成紀錄" }));
    await waitFor(() => expect(listAdminHistory).toHaveBeenCalledTimes(1));

    fireEvent.click(await screen.findByRole("button", { name: /Entra ID/ }));
    fireEvent.click(await screen.findByRole("option", { name: /Alice/ }));

    await waitFor(() => expect(listAdminHistory).toHaveBeenCalledTimes(2));
    expect(listAdminHistory).toHaveBeenLastCalledWith({
      userId: "user-1",
      source: "",
      page: 1,
      pageSize: 10,
    });
    expect(listAdminStyles).not.toHaveBeenCalled();
  });

  it("keeps the Entra ID and Google user filters separate and searchable", async () => {
    listAdminUserOptions.mockResolvedValue([
      {
        id: "user-1",
        email: "alice@example.com",
        displayName: "Alice",
        role: "viewer",
        isActive: true,
        authProvider: "entra",
      },
      {
        id: "user-2",
        email: "bob@example.com",
        displayName: "Bob",
        role: "viewer",
        isActive: true,
        authProvider: "google",
      },
      {
        id: "user-3",
        email: "carol@example.com",
        displayName: "Carol",
        role: "viewer",
        isActive: true,
        authProvider: "google",
      },
    ]);

    renderPanel();
    await screen.findByText("alice@example.com");

    fireEvent.click(screen.getByRole("button", { name: "生成紀錄" }));
    await waitFor(() => expect(listAdminHistory).toHaveBeenCalledTimes(1));

    fireEvent.click(await screen.findByRole("button", { name: /Entra ID/ }));
    expect(screen.queryByRole("option", { name: /Bob/ })).toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });

    fireEvent.click(await screen.findByRole("button", { name: /Google/ }));
    expect(await screen.findByRole("option", { name: /Bob/ })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /Alice/ })).toBeNull();

    fireEvent.change(screen.getByLabelText("搜尋Google"), {
      target: { value: "carol" },
    });

    expect(await screen.findByRole("option", { name: /Carol/ })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /Bob/ })).toBeNull();
  });

  it("reloads the user list with the keyword search", async () => {
    renderPanel();
    await screen.findByText("alice@example.com");

    expect(listAdminUsers).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 10,
      search: "",
    });

    fireEvent.change(screen.getByLabelText("搜尋使用者"), {
      target: { value: "alice" },
    });

    await waitFor(() => expect(listAdminUsers).toHaveBeenCalledTimes(2));
    expect(listAdminUsers).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 10,
      search: "alice",
    });
  });

  it("shows which feature produced each image and filters by it", async () => {
    listAdminHistory.mockResolvedValue({
      items: [
        {
          id: "history-1",
          hasImage: false,
          fullPrompt: "一隻貓",
          model: "gemini-imagen",
          source: "image-transform",
          userDisplayName: "Alice",
          userEmail: "alice@example.com",
          createdAt: { seconds: 1700000000 },
        },
      ],
      pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
    });

    renderPanel();
    await screen.findByText("alice@example.com");

    fireEvent.click(screen.getByRole("button", { name: "生成紀錄" }));
    await waitFor(() => expect(listAdminHistory).toHaveBeenCalledTimes(1));
    const table = await screen.findByRole("table");
    expect(within(table).getByText("圖片轉換")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("依功能篩選生成紀錄"), {
      target: { value: "document" },
    });

    await waitFor(() => expect(listAdminHistory).toHaveBeenCalledTimes(2));
    expect(listAdminHistory).toHaveBeenLastCalledWith({
      userId: "",
      source: "document",
      page: 1,
      pageSize: 10,
    });
  });
});
