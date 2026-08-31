import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import LoginPage from "../LoginPage";
import useAuth from "../../hooks/useAuth";

vi.mock("../../hooks/useAuth", () => ({
  default: vi.fn(),
}));

vi.mock("../../components/auth/LoginShaderBackground", () => ({
  default: () => <div data-testid="login-shader" />,
}));

vi.mock("@react-oauth/google", () => ({
  GoogleLogin: ({ onSuccess, onError, theme }) => (
    <div data-testid="google-login" data-theme={theme}>
      <button type="button" onClick={() => onSuccess({ credential: "google-token" })}>
        Google 成功
      </button>
      <button type="button" onClick={onError}>
        Google 失敗
      </button>
    </div>
  ),
}));

const renderLogin = (initialEntry = "/login") =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/workspace" element={<div>創作工作區</div>} />
      </Routes>
    </MemoryRouter>
  );

describe("LoginPage", () => {
  const handleMicrosoftLogin = vi.fn();
  const handleGoogleLoginSuccess = vi.fn();

  afterEach(() => {
    cleanup();
    document.documentElement.classList.remove("dark");
  });

  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({
      handleMicrosoftLogin,
      handleGoogleLoginSuccess,
      isAuthenticated: false,
      isLoading: false,
      authExpired: false,
      profileError: "",
    });
  });

  it("renders the Pixora login experience and keeps both providers available", () => {
    renderLogin();

    expect(screen.getByRole("heading", { name: "繼續你的創作" })).toBeInTheDocument();
    expect(screen.getByTestId("login-shader")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "使用 Microsoft 帳號繼續" }));
    fireEvent.click(screen.getByRole("button", { name: "Google 成功" }));

    expect(handleMicrosoftLogin).toHaveBeenCalledOnce();
    expect(handleGoogleLoginSuccess).toHaveBeenCalledWith({ credential: "google-token" });
  });

  it("keeps the login surface light when the application theme is dark", () => {
    document.documentElement.classList.add("dark");
    const { container } = renderLogin();

    expect(container.querySelector("main")).toHaveClass("login-light-theme");
    expect(screen.getByTestId("google-login")).toHaveAttribute("data-theme", "outline");
    expect(screen.queryByRole("button", { name: /切換至.*模式/ })).not.toBeInTheDocument();
  });

  it("surfaces Google sign-in failures inside the page", () => {
    renderLogin();

    fireEvent.click(screen.getByRole("button", { name: "Google 失敗" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Google 登入失敗，請稍後再試");
  });

  it("shows the session error returned by authentication", () => {
    useAuth.mockReturnValue({
      handleMicrosoftLogin,
      handleGoogleLoginSuccess,
      isAuthenticated: false,
      isLoading: false,
      authExpired: true,
      profileError: "無法載入登入工作階段",
    });

    renderLogin();

    expect(screen.getByRole("alert")).toHaveTextContent("無法載入登入工作階段");
  });

  it("uses a layout-matched loading state while the session is checked", () => {
    useAuth.mockReturnValue({
      handleMicrosoftLogin,
      handleGoogleLoginSuccess,
      isAuthenticated: false,
      isLoading: true,
      authExpired: false,
      profileError: "",
    });

    renderLogin();

    expect(screen.getByRole("status", { name: "正在確認登入狀態" })).toBeInTheDocument();
  });

  it("returns authenticated users to their requested route", () => {
    useAuth.mockReturnValue({
      handleMicrosoftLogin,
      handleGoogleLoginSuccess,
      isAuthenticated: true,
      isLoading: false,
      authExpired: false,
      profileError: "",
    });

    renderLogin({
      pathname: "/login",
      state: { from: { pathname: "/workspace" } },
    });

    expect(screen.getByText("創作工作區")).toBeInTheDocument();
  });
});
