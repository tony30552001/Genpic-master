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

const historyItems = [
  {
    id: "history-1",
    hasImage: true,
    fullPrompt: "第一張完整 Prompt",
    userScript: "第一張腳本",
    model: "gemini-imagen",
    styleName: "水彩",
    userId: "user-1",
    userEmail: "alice@example.com",
    userDisplayName: "Alice",
    createdAt: { seconds: 1700000000 },
  },
  {
    id: "history-2",
    hasImage: true,
    fullPrompt: "第二張完整 Prompt",
    model: "gemini-imagen",
    userId: "user-2",
    userEmail: "bob@example.com",
    userDisplayName: "Bob",
    createdAt: { seconds: 1700000100 },
  },
  {
    id: "history-3",
    hasImage: false,
    fullPrompt: "沒有圖片的紀錄",
    model: "gemini-imagen",
    userId: "user-3",
    userEmail: "carol@example.com",
    userDisplayName: "Carol",
    createdAt: { seconds: 1700000200 },
  },
];

const historyImages = {
  "history-1": "https://example.com/first.png",
  "history-2": "https://example.com/second.png",
};

const emptyPage = { items: [], pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 } };

const openHistorySection = async () => {
  render(
    <MemoryRouter>
      <AdminPanel />
    </MemoryRouter>
  );

  const historyTab = await screen.findByRole("button", { name: "生成紀錄" });
  fireEvent.click(historyTab);

  return screen.findByRole("button", { name: "放大查看 Alice 的生成圖片" });
};

describe("AdminPanel history preview", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    listAdminUsers.mockResolvedValue(emptyPage);
    listAdminStyles.mockResolvedValue(emptyPage);
    listAdminUserOptions.mockResolvedValue([]);
    getAdminModelSettings.mockResolvedValue({
      modelPolicy: { allowedModels: ["gpt-image-2"], defaultModel: "gpt-image-2" },
      supportedModels: ["gpt-image-2"],
    });
    listAdminHistory.mockResolvedValue({
      items: historyItems,
      pagination: { page: 1, pageSize: 10, total: 3, totalPages: 1 },
    });
    getAdminHistoryImage.mockImplementation(async (historyId) => ({
      imageUrl: historyImages[historyId] || "",
    }));
  });

  it("opens a lightbox with the record details when a thumbnail is clicked", async () => {
    const trigger = await openHistorySection();

    fireEvent.click(trigger);

    const dialog = await screen.findByRole("dialog", { name: "放大查看Alice 的生成圖片" });
    expect(within(dialog).getByText("第一張完整 Prompt")).toBeInTheDocument();
    expect(within(dialog).getByText(/alice@example.com/)).toBeInTheDocument();
    expect(within(dialog).getByText("水彩")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "下載原圖" })).toHaveAttribute(
      "href",
      "https://example.com/first.png"
    );
  });

  it("moves between records that have an image", async () => {
    const trigger = await openHistorySection();

    fireEvent.click(trigger);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("第 1 / 2 張")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "上一張圖片" })).toBeDisabled();

    fireEvent.click(within(dialog).getByRole("button", { name: "下一張圖片" }));

    await waitFor(() => {
      expect(within(dialog).getByText("第 2 / 2 張")).toBeInTheDocument();
    });
    expect(within(dialog).getByText("第二張完整 Prompt")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "下載原圖" })).toHaveAttribute(
      "href",
      "https://example.com/second.png"
    );
    expect(within(dialog).getByRole("button", { name: "下一張圖片" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "上一張圖片" })).toBeEnabled();
  });

  it("closes the lightbox", async () => {
    const trigger = await openHistorySection();

    fireEvent.click(trigger);
    await screen.findByRole("dialog");

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("does not make records without an image clickable", async () => {
    await openHistorySection();

    expect(
      screen.queryByRole("button", { name: "放大查看 Carol 的生成圖片" })
    ).not.toBeInTheDocument();
    expect(screen.getByText("無預覽")).toBeInTheDocument();
  });
});
