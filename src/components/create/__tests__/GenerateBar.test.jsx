import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  it("locks the aspect ratio to the attached image", () => {
    render(<GenerateBar {...BASE_PROPS} aspectRatioLocked buttonText="修改這張" actionKind="transform" />);
    const group = screen.getByRole("group", { name: "圖片比例（沿用原圖）" });
    for (const button of within(group).getAllByRole("button")) {
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute("aria-pressed", "false");
    }
    expect(screen.getByText(/沿用原圖比例/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "修改這張" })).toBeEnabled();
  });

  it("suggests refining without blocking regeneration", () => {
    const onSuggestRefine = vi.fn();
    const onGenerate = vi.fn();
    render(<GenerateBar {...BASE_PROPS} onGenerate={onGenerate} onSuggestRefine={onSuggestRefine} />);
    fireEvent.click(screen.getByRole("button", { name: /只改一小部分/ }));
    expect(onSuggestRefine).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /開始生成圖片/ }));
    expect(onGenerate).toHaveBeenCalled();
  });

  it("hides the refine suggestion while generating or when not offered", () => {
    const { rerender } = render(<GenerateBar {...BASE_PROPS} />);
    expect(screen.queryByRole("button", { name: /只改一小部分/ })).toBeNull();
    rerender(<GenerateBar {...BASE_PROPS} isGenerating onSuggestRefine={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /只改一小部分/ })).toBeNull();
  });

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
    expect(screen.queryByRole("combobox", { name: /品質|模型|解析度/ })).not.toBeInTheDocument();
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

  it("switches the in-image text mode next to the generate button", () => {
    const onImageLanguageChange = vi.fn();
    const { rerender } = render(
      <GenerateBar {...BASE_PROPS} imageLanguage="zh-TW" onImageLanguageChange={onImageLanguageChange} />
    );
    const group = screen.getByRole("group", { name: "圖中文字" });
    expect(within(group).getByRole("button", { name: "繁中" })).toHaveAttribute("aria-pressed", "true");
    expect(within(group).getByRole("button", { name: "無文字" })).toHaveAttribute("aria-pressed", "false");
    expect(within(group).getByRole("combobox", { name: "其他圖中文字語言" })).toHaveTextContent("其他");
    expect(screen.getByText(/GPT Image 2 ·/)).toHaveTextContent("· 繁中文字");

    fireEvent.click(within(group).getByRole("button", { name: "無文字" }));
    expect(onImageLanguageChange).toHaveBeenCalledWith("none");

    rerender(<GenerateBar {...BASE_PROPS} imageLanguage="none" onImageLanguageChange={onImageLanguageChange} />);
    expect(within(group).getByRole("button", { name: "無文字" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/GPT Image 2 ·/)).toHaveTextContent("· 無文字");

    rerender(<GenerateBar {...BASE_PROPS} imageLanguage="ja" onImageLanguageChange={onImageLanguageChange} />);
    expect(within(group).getByRole("button", { name: "繁中" })).toHaveAttribute("aria-pressed", "false");
    expect(within(group).getByRole("combobox", { name: "其他圖中文字語言" })).toHaveTextContent("日文");
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

describe("GenerateBar compact (phone)", () => {
  const STATUS = { shortLabel: "配置版面", label: "正在配置版面", elapsedLabel: "12 秒", progress: 40, helperText: "x" };

  it("collapses output settings into a summary that opens a sheet", async () => {
    const onAspectRatioChange = vi.fn();
    const { rerender } = render(
      <GenerateBar {...BASE_PROPS} compact onAspectRatioChange={onAspectRatioChange} imageLanguage="zh-TW" onImageLanguageChange={vi.fn()} />
    );
    expect(screen.queryByRole("group", { name: "圖片比例" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "輸出設定：16:9 · 中 · 繁中文字" }));

    const sheet = screen.getByRole("dialog", { name: "輸出設定" });
    fireEvent.click(within(sheet).getByRole("button", { name: "設定圖片比例為 1:1 社群" }));
    expect(onAspectRatioChange).toHaveBeenCalledWith("1:1");

    rerender(<GenerateBar {...BASE_PROPS} compact aspectRatio="1:1" onAspectRatioChange={onAspectRatioChange} imageLanguage="zh-TW" onImageLanguageChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "輸出設定：1:1 · 中 · 繁中文字" })).toBeInTheDocument();
  });

  it("closes the sheet before generating from it", async () => {
    const onGenerate = vi.fn();
    render(<GenerateBar {...BASE_PROPS} compact onGenerate={onGenerate} />);
    fireEvent.click(screen.getByRole("button", { name: /輸出設定：/ }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "輸出設定" })).getByRole("button", { name: /開始生成圖片/ }));
    expect(onGenerate).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "輸出設定" })).toBeNull());
  });

  it("shows the result thumbnail and swaps the summary for progress while generating", () => {
    const onOpenResult = vi.fn();
    const { rerender } = render(<GenerateBar {...BASE_PROPS} compact resultImage="data:image/png;base64,AA" onOpenResult={onOpenResult} />);
    fireEvent.click(screen.getByRole("button", { name: "查看生成結果" }));
    expect(onOpenResult).toHaveBeenCalled();

    rerender(<GenerateBar {...BASE_PROPS} compact isGenerating generationStatus={STATUS} onCancelGeneration={vi.fn()} resultImage="data:image/png;base64,AA" />);
    expect(screen.queryByRole("button", { name: /輸出設定：/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "查看生成結果" })).toBeNull();
    expect(screen.getByText("正在配置版面")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument();
  });
});