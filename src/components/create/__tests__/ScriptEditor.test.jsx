import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ScriptEditor from "../ScriptEditor";

vi.mock("../../../services/aiService", () => ({ optimizePrompt: vi.fn() }));
vi.mock("../StyleSourceTabs", () => ({ default: () => null }));
afterEach(cleanup);

function Harness({ initialScript = "", imageLanguage = "zh-TW", onImageLanguageChange = vi.fn() }) {
  const [script, setScript] = React.useState(initialScript);
  return (
    <ScriptEditor
      userScript={script}
      onUserScriptChange={setScript}
      imageLanguage={imageLanguage}
      onImageLanguageChange={onImageLanguageChange}
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
