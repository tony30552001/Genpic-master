import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
      modelPolicy: { allowedModels: ["gpt-image-2"], defaultModel: "gpt-image-2" },
      supportedModels: ["gpt-image-2"],
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
