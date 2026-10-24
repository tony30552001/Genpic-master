import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AppHeader from "../AppHeader";
import { FileText, Library, Sparkles, SlidersHorizontal } from "@/components/icons/lucideContent";

const tabs = [
  { id: "general", label: "一般創作", icon: Sparkles },
  { id: "document", label: "文件創作", icon: FileText },
  { id: "library", label: "素材中心", icon: Library },
  { id: "settings", label: "設定", icon: SlidersHorizontal },
];

const user = { displayName: "Tony Lin", email: "tony@example.com" };

function renderHeader(props = {}) {
  const handlers = {
    onTabChange: vi.fn(),
    onOpenAdmin: vi.fn(),
    onLogin: vi.fn(),
    onLogout: vi.fn(),
  };
  render(
    <AppHeader
      tabs={tabs}
      activeTab="document"
      user={user}
      isAdmin={false}
      isLoading={false}
      {...handlers}
      {...props}
    />
  );
  return handlers;
}

describe("AppHeader", () => {
  afterEach(cleanup);

  it("marks the active tab and switches tabs", async () => {
    const { onTabChange } = renderHeader();
    const nav = screen.getByRole("navigation", { name: "主要功能" });

    expect(nav).toContainElement(screen.getByRole("button", { name: "文件創作", pressed: true }));
    await userEvent.click(screen.getByRole("button", { name: "素材中心" }));
    expect(onTabChange).toHaveBeenCalledWith("library");
  });

  it("shows the admin shortcut only for admins", async () => {
    const { onOpenAdmin } = renderHeader({ isAdmin: true });

    await userEvent.click(screen.getByRole("button", { name: "管理中心" }));
    expect(onOpenAdmin).toHaveBeenCalled();
    cleanup();

    renderHeader();
    expect(screen.queryByRole("button", { name: "管理中心" })).not.toBeInTheDocument();
  });

  it("opens the account menu with identity, theme and logout", async () => {
    const { onLogout } = renderHeader();

    await userEvent.click(screen.getByRole("button", { name: "帳號選單" }));
    expect(screen.getByText("tony@example.com")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /切換至(深|淺)色模式/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("menuitem", { name: "登出" }));
    expect(onLogout).toHaveBeenCalled();
  });

  it("shows a login button when signed out", async () => {
    const { onLogin } = renderHeader({ user: null });

    expect(screen.queryByRole("button", { name: "帳號選單" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "登入" }));
    expect(onLogin).toHaveBeenCalled();
  });
});
