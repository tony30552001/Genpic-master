import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config", () => ({
  API_BASE_URL: "/api",
}));

vi.mock("../apiClient", () => ({
  apiDelete: vi.fn(() => Promise.resolve(null)),
  apiGet: vi.fn(() => Promise.resolve([])),
  apiPut: vi.fn(() => Promise.resolve({})),
  apiPost: vi.fn(() => Promise.resolve({})),
}));

import { apiDelete, apiGet, apiPost, apiPut } from "../apiClient";
import {
  createAdminImageModel,
  deleteAdminImageModel,
  getAdminModelSettings,
  listAdminHistory,
  listAdminImageModels,
  listAdminStyles,
  listAdminUsers,
  listAdminUserOptions,
  updateAdminModelSettings,
  updateAdminUserStatus,
  updateAdminImageModel,
  testAdminImageModel,
} from "../adminService";

describe("adminService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the non-reserved management API route", async () => {
    await getAdminModelSettings();
    await listAdminUsers({ page: 2, pageSize: 25 });
    await listAdminUserOptions();
    await updateAdminModelSettings({
      allowedModels: ["gpt-image-2"],
      defaultModel: "gpt-image-2",
    });
    await updateAdminUserStatus("user-id", false);

    expect(apiGet).toHaveBeenNthCalledWith(1, "/api/management/settings");
    expect(apiGet).toHaveBeenNthCalledWith(2, "/api/management/users?page=2&pageSize=25");
    expect(apiGet).toHaveBeenNthCalledWith(3, "/api/management/user-options");
    expect(apiPut).toHaveBeenCalledWith("/api/management/settings", {
      allowedModels: ["gpt-image-2"],
      defaultModel: "gpt-image-2",
    });
    expect(apiPut).toHaveBeenCalledWith("/api/management/users/user-id", { isActive: false });
  });

  it("defaults user pagination to ten items", async () => {
    await listAdminUsers();

    expect(apiGet).toHaveBeenCalledWith("/api/management/users?page=1&pageSize=10");
  });

  it("uses catalog CRUD and explicit queued tests without changing policy", async () => {
    const model = {
      modelKey: "compatible-next", label: "Compatible Next",
      apiType: "azure-openai-images-v1", deploymentName: "custom-alias",
      endpoint: "https://example.openai.azure.com/openai/v1",
      supportedQualities: ["low", "medium", "high", "xhigh", "max", "auto"],
      defaultQuality: "auto", apiKey: "test-only-key",
    };
    const catalog = { models: [{ ...model, apiKey: undefined, hasApiKey: true }] };
    apiPost.mockResolvedValueOnce(catalog);
    await listAdminImageModels();
    expect(await createAdminImageModel(model)).toBe(catalog);
    await updateAdminImageModel("compatible/next", { ...model, apiKey: "" });
    await deleteAdminImageModel("compatible/next");
    const controller = new AbortController();
    await testAdminImageModel({ modelKey: model.modelKey }, { signal: controller.signal });

    expect(apiGet).toHaveBeenCalledWith("/api/management/image-models");
    expect(apiPost).toHaveBeenNthCalledWith(1, "/api/management/image-models", model);
    expect(apiPut).toHaveBeenCalledWith("/api/management/image-models/compatible%2Fnext", { ...model, apiKey: "" });
    expect(apiDelete).toHaveBeenCalledWith("/api/management/image-models/compatible%2Fnext");
    expect(apiPost).toHaveBeenNthCalledWith(2, "/api/management/image-model-tests",
      { modelKey: model.modelKey }, { signal: controller.signal });
    expect(apiPut).not.toHaveBeenCalledWith("/api/management/settings", expect.anything());
  });

  it("propagates catalog and paid test errors", async () => {
    apiGet.mockRejectedValueOnce(new Error("catalog unavailable"));
    apiPost.mockRejectedValueOnce(new Error("test rejected"));
    await expect(listAdminImageModels()).rejects.toThrow("catalog unavailable");
    await expect(testAdminImageModel({ modelKey: "custom" })).rejects.toThrow("test rejected");
  });

  it("passes pagination and user filters to history and styles", async () => {
    await listAdminHistory({ userId: "user-id", page: 2, pageSize: 10 });
    await listAdminStyles({ userId: "user-id", page: 3, pageSize: 25 });

    expect(apiGet).toHaveBeenNthCalledWith(
      1,
      "/api/management/history?userId=user-id&page=2&pageSize=10"
    );
    expect(apiGet).toHaveBeenNthCalledWith(
      2,
      "/api/management/styles?userId=user-id&page=3&pageSize=25"
    );
  });
});
