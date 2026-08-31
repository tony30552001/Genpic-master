import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import GenerateBar from "../GenerateBar";

const BASE_PROPS = {
  aspectRatio: "16:9",
  onAspectRatioChange: vi.fn(),
  imageSize: "1K",
  onImageSizeChange: vi.fn(),
  imageQuality: "medium",
  onImageQualityChange: vi.fn(),
  imageModel: "gemini-imagen",
  isGenerating: false,
  onGenerate: vi.fn(),
};

describe("GenerateBar", () => {
  it("uses the semantic product glyph for the current action", () => {
    const { container } = render(
      <GenerateBar
        {...BASE_PROPS}
        actionKind="transform"
        buttonText="開始 AI 轉換"
      />
    );

    expect(screen.getByRole("button", { name: "開始 AI 轉換" })).toBeInTheDocument();
    expect(container.querySelector('[data-product-glyph="transform"]')).toBeInTheDocument();
  });

  it("switches to the shared generation signature without hiding progress text", () => {
    const { container } = render(
      <GenerateBar
        {...BASE_PROPS}
        isGenerating
        generationStatus={{
          shortLabel: "配置版面",
          label: "正在配置版面",
          elapsedLabel: "12 秒",
          progress: 40,
          helperText: "正在建立視覺結構",
        }}
      />
    );

    expect(container.querySelector("[data-generation-signature]")).toBeInTheDocument();
    expect(screen.getAllByText("正在配置版面").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /配置版面/ })).toBeDisabled();
  });
});
