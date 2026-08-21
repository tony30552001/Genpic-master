import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AdminPanel from "../AdminPanel";
import {
  getAdminHistoryImage,
  getAdminModelSettings,
  listAdminHistory,
  listAdminStyles,
  listAdminUserOptions,
  listAdminUsers,
} from "../../../services/adminService";

vi.mock("../../../services/adminService", () => ({
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

vi.mock("../../../hooks/useAuth", () => ({
  default: () => ({
    user: { email: "admin@example.com" },
    profile: { displayName: "管理員", role: "admin" },
    handleLogout: vi.fn(),
  }),
}));

const emptyPage = { items: [], pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 } };

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
    getAdminModelSettings.mockResolvedValue({
      modelPolicy: { allowedModels: ["gemini-imagen"], defaultModel: "gemini-imagen" },
      supportedModels: ["gemini-imagen"],
    });
  });

  it("only loads the users section on mount", async () => {
    renderPanel();

    await screen.findByText("alice@example.com");

    expect(listAdminUsers).toHaveBeenCalledTimes(1);
    expect(listAdminHistory).not.toHaveBeenCalled();
    expect(listAdminStyles).not.toHaveBeenCalled();
    expect(getAdminModelSettings).not.toHaveBeenCalled();
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
  });

  it("reloads the filtered sections when the user filter changes", async () => {
    renderPanel();
    await screen.findByText("alice@example.com");

    fireEvent.click(screen.getByRole("button", { name: "生成紀錄" }));
    await waitFor(() => expect(listAdminHistory).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText("依使用者篩選"), {
      target: { value: "user-1" },
    });

    await waitFor(() => expect(listAdminHistory).toHaveBeenCalledTimes(2));
    expect(listAdminHistory).toHaveBeenLastCalledWith({
      userId: "user-1",
      page: 1,
      pageSize: 10,
    });
    expect(listAdminStyles).not.toHaveBeenCalled();
  });
});
