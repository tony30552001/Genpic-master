import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config", () => ({
  API_BASE_URL: "/api",
}));

vi.mock("../apiClient", () => ({
  apiDelete: vi.fn(() => Promise.resolve(null)),
  apiGet: vi.fn(() => Promise.resolve([])),
  apiPut: vi.fn(() => Promise.resolve({})),
}));

import { apiGet, apiPut } from "../apiClient";
import {
  getAdminModelSettings,
  listAdminHistory,
  listAdminStyles,
  listAdminUsers,
  listAdminUserOptions,
  updateAdminModelSettings,
  updateAdminUserStatus,
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
