import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SettingsPanel from "../SettingsPanel";
afterEach(cleanup);

vi.mock("../../../hooks/useLineConfig", () => ({ default: () => ({}) }));
vi.mock("../LineSettings", () => ({ default: () => null }));

describe("SettingsPanel image model metadata", () => {
  it("shows catalog metadata read-only, including custom keys and qualities", () => {
    render(<SettingsPanel imageLanguage="zh-TW" onImageLanguageChange={vi.fn()} imageModelConfig={{
      modelKey: "tenant-custom", label: "Tenant Model", apiType: "azure-openai-images-v1",
      supportedQualities: ["xhigh", "max", "auto"], defaultQuality: "auto",
    }} />);
    expect(screen.getByText("目前模型：Tenant Model")).toBeInTheDocument();
    expect(screen.getByText(/模型識別：tenant-custom/)).toHaveTextContent("支援品質：超高、最高、自動");
    expect(screen.getByText(/模型識別：tenant-custom/)).toHaveTextContent("預設品質：自動");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Tenant Model/ })).not.toBeInTheDocument();
  });

  it("shows a setup error with no default model fallback", () => {
    render(<SettingsPanel imageLanguage="zh-TW" onImageLanguageChange={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("請聯絡管理員");
    expect(screen.queryByText(/GPT Image 2/)).not.toBeInTheDocument();
  });
});
