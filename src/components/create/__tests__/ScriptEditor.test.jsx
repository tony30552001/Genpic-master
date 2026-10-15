import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ScriptEditor from "../ScriptEditor";
import { optimizePrompt } from "../../../services/aiService";
import { getAttachmentPurpose } from "@/lib/attachmentPurposes";

vi.mock("../../../services/aiService", () => ({ optimizePrompt: vi.fn() }));
vi.mock("../StyleSourceTabs", () => ({ default: () => null }));
afterEach(cleanup);

function Harness({ initialScript = "", imageLanguage = "zh-TW", onImageLanguageChange = vi.fn(), ...props }) {
  const [script, setScript] = React.useState(initialScript);
  return (
    <ScriptEditor
      userScript={script}
      onUserScriptChange={setScript}
      imageLanguage={imageLanguage}
      onImageLanguageChange={onImageLanguageChange}
      {...props}
    />
  );
}

describe("ScriptEditor no-text hint", () => {
  it("offers switching to no-text when the prompt asks for no text", () => {
    const onImageLanguageChange = vi.fn();
    render(<Harness initialScript="工地插圖，不要文字" onImageLanguageChange={onImageLanguageChange} />);
    expect(screen.getByRole("status")).toHaveTextContent("偵測到你不要圖中文字");
    fireEvent.click(screen.getByRole("button", { name: "改用無文字" }));
    expect(onImageLanguageChange).toHaveBeenCalledWith("none");
  });

  it("stays hidden in no-text mode and for unrelated prompts", () => {
    const { unmount } = render(<Harness initialScript="工地插圖，不要文字" imageLanguage="none" />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    unmount();
    render(<Harness initialScript="標題寫安全第一" />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("dismisses until the prompt changes", () => {
    render(<Harness initialScript="不要文字" />);
    fireEvent.click(screen.getByRole("button", { name: "略過" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "內容描述" }), { target: { value: "不要文字，白色背景" } });
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});

describe("ScriptEditor attachment purposes", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(optimizePrompt).mockReset();
  });

  it("describes the edit and hides the composition choice for transforms", () => {
    render(<Harness attachmentPurpose={getAttachmentPurpose("refine")} />);
    expect(screen.getByRole("textbox", { name: "要修改的地方" })).toHaveAttribute(
      "placeholder",
      expect.stringContaining("其他部分會保持不變")
    );
    expect(screen.queryByRole("group", { name: "畫面用途" })).not.toBeInTheDocument();
  });

  it("keeps the composition choice for plain generation", () => {
    render(<Harness />);
    expect(screen.getByRole("textbox", { name: "內容描述" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "畫面用途" })).toBeInTheDocument();
  });

  it("optimizes transform prompts in transform mode", async () => {
    vi.mocked(optimizePrompt).mockResolvedValue({ optimizedPromptZh: "改好", optimizedPromptEn: "done" });
    render(<Harness initialScript="衣服改黃色" attachmentPurpose={getAttachmentPurpose("refine")} />);
    fireEvent.click(screen.getByRole("button", { name: "AI 智能優化" }));
    await screen.findByText("改好");
    expect(optimizePrompt).toHaveBeenCalledWith(expect.objectContaining({
      optimizationMode: "transform",
      transformMode: "refine",
    }));
  });

  it("applies an optimization, closes the suggestion and marks the rewritten prompt", async () => {
    vi.mocked(optimizePrompt).mockResolvedValue({ optimizedPromptZh: "黃昏下的城市街景", optimizedPromptEn: "city" });
    const { container } = render(<Harness initialScript="城市" />);
    expect(container.querySelector("[data-applied-flash]")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "AI 智能優化" }));
    fireEvent.click(await screen.findByRole("button", { name: "套用優化" }));

    expect(screen.getByRole("textbox", { name: "內容描述" })).toHaveValue("黃昏下的城市街景");
    expect(container.querySelector("[data-applied-flash]")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("button", { name: "套用優化" })).toBeNull());
  });

  it("keeps the advanced style section collapsed until opened and remembers it", () => {
    const { unmount } = render(<Harness />);
    const toggle = screen.getByRole("button", { name: /進階：風格/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveTextContent("未套用");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    unmount();
    render(<Harness />);
    expect(screen.getByRole("button", { name: /進階：風格/ })).toHaveAttribute("aria-expanded", "true");
  });

  it("summarizes and clears an applied style while collapsed", () => {
    const onClearStyle = vi.fn();
    const onPaletteStyleChange = vi.fn();
    render(
      <Harness
        analyzedStyle="watercolor"
        analysisResultData={{ style_name: "水彩" }}
        paletteStyleTags={["柔和"]}
        onClearStyle={onClearStyle}
        onPaletteStyleChange={onPaletteStyleChange}
      />
    );
    expect(screen.getByRole("button", { name: /進階：風格/ })).toHaveTextContent("水彩");
    fireEvent.click(screen.getByRole("button", { name: "清除套用的風格" }));
    expect(onClearStyle).toHaveBeenCalled();
    expect(onPaletteStyleChange).toHaveBeenCalledWith([]);
  });

  it("offers style transfer only with an attachment", () => {
    const onUseStyleTransfer = vi.fn();
    const { unmount } = render(<Harness />);
    expect(screen.queryByRole("heading", { name: "套用風格到附圖" })).not.toBeInTheDocument();
    unmount();
    render(
      <Harness
        attachmentPurpose={getAttachmentPurpose("reference")}
        onUseStyleTransfer={onUseStyleTransfer}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /進階：風格/ }));
    fireEvent.click(screen.getByRole("button", { name: "使用" }));
    expect(onUseStyleTransfer).toHaveBeenCalled();
  });

  it("passes style reference files without treating them as content", () => {
    const onStyleReferenceUpload = vi.fn();
    render(<Harness onStyleReferenceUpload={onStyleReferenceUpload} />);
    const file = new File(["x"], "style.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("選擇風格參考圖檔案"), { target: { files: [file] } });
    expect(onStyleReferenceUpload).toHaveBeenCalledWith(file);
  });
});
