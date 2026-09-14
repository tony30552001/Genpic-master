import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import GenerateBar from "../GenerateBar";
afterEach(cleanup);

const BASE_PROPS = {
  aspectRatio: "16:9",
  onAspectRatioChange: vi.fn(),
  imageQuality: "medium",
  onImageQualityChange: vi.fn(),
  imageModelConfig: {
    modelKey: "gpt-image-2",
    label: "GPT Image 2",
    apiType: "azure-openai-images-v1",
    supportedQualities: ["low", "medium", "high"],
    defaultQuality: "medium",
  },
  isGenerating: false,
  onGenerate: vi.fn(),
};

describe("GenerateBar", () => {
  it.each([
    ["gpt-image-2", ["low", "medium", "high"], ["低", "中", "高"]],
    ["gpt-image-2.5-flare", ["low", "medium", "high", "xhigh", "max", "auto"], ["低", "中", "高", "超高", "最高", "自動"]],
    ["custom-deployment", ["auto", "max"], ["自動", "最高"]],
  ])("renders only catalog qualities for %s and forwards exact values", (modelKey, supportedQualities, labels) => {
    const onImageQualityChange = vi.fn();
    render(<GenerateBar {...BASE_PROPS} onImageQualityChange={onImageQualityChange}
      imageQuality={supportedQualities[0]}
      imageModelConfig={{ ...BASE_PROPS.imageModelConfig, modelKey, label: modelKey, supportedQualities, defaultQuality: supportedQualities[0] }} />);
    const choices = within(screen.getByRole("group", { name: "圖片品質" })).getAllByRole("button");
    expect(choices.map((button) => button.textContent)).toEqual(labels);
    choices.forEach((button, index) => {
      fireEvent.click(button);
      expect(onImageQualityChange).toHaveBeenNthCalledWith(index + 1, supportedQualities[index]);
    });
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /解析度/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/1K|2K|4K/)).not.toBeInTheDocument();
  });

  it("uses the catalog default only when quality was omitted", () => {
    const { rerender } = render(<GenerateBar {...BASE_PROPS} imageQuality={undefined}
      imageModelConfig={{ ...BASE_PROPS.imageModelConfig, defaultQuality: "high" }} />);
    expect(screen.getByRole("button", { name: "設定圖片品質為高" })).toHaveAttribute("aria-pressed", "true");
    rerender(<GenerateBar {...BASE_PROPS} imageQuality="max" />);
    expect(screen.getByRole("alert")).toHaveTextContent("請重新選擇圖片品質");
    expect(screen.getByRole("button", { name: "開始生成圖片" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "設定圖片品質為中" })).toHaveAttribute("aria-pressed", "false");
  });

  it("disables generation without a configured model and does not guess another one", () => {
    const onGenerate = vi.fn();
    render(<GenerateBar {...BASE_PROPS} imageModelConfig={undefined} onGenerate={onGenerate} />);
    expect(screen.getByRole("alert")).toHaveTextContent("請聯絡管理員");
    fireEvent.click(screen.getByRole("button", { name: "開始生成圖片" }));
    expect(onGenerate).not.toHaveBeenCalled();
    expect(within(screen.getByRole("group", { name: "圖片品質" })).queryAllByRole("button")).toHaveLength(0);
  });

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

  it("uses a restrained loading spinner without hiding progress text", () => {
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

    expect(container.querySelector("[data-generation-spinner]")).toBeInTheDocument();
    expect(container.querySelector("[data-generation-signature]")).not.toBeInTheDocument();
    expect(screen.getAllByText("正在配置版面").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /配置版面/ })).toBeDisabled();
  });
});
