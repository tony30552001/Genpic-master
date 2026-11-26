import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ScriptTemplateDialog from "../ScriptTemplateDialog";
import { SCRIPT_TEMPLATE_LIMITS, buildScriptPrompt } from "@/lib/videoScriptTemplate";

describe("ScriptTemplateDialog", () => {
  const writeText = vi.fn();

  beforeEach(() => {
    writeText.mockReset();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  });

  afterEach(cleanup);

  const open = () => render(<ScriptTemplateDialog open onOpenChange={vi.fn()} />);

  it("lists every import limit and links the published templates", () => {
    open();

    for (const { label, value } of SCRIPT_TEMPLATE_LIMITS) {
      expect(screen.getByText(label)).toBeTruthy();
      expect(screen.getAllByText(value).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/templates/video-script-template.docx",
      "/templates/video-script-example.docx",
    ]);
  });

  it("copies the prompt and confirms it", async () => {
    writeText.mockResolvedValue(undefined);
    open();

    fireEvent.click(screen.getByRole("button", { name: "複製 AI 提示詞" }));

    expect(await screen.findByRole("button", { name: "已複製" })).toBeTruthy();
    expect(writeText).toHaveBeenCalledWith(buildScriptPrompt());
  });

  it("shows why copying failed", async () => {
    writeText.mockRejectedValue(new Error("Write permission denied"));
    open();

    fireEvent.click(screen.getByRole("button", { name: "複製 AI 提示詞" }));

    expect((await screen.findByRole("alert")).textContent).toContain("Write permission denied");
    expect(screen.queryByRole("button", { name: "已複製" })).toBeNull();
  });
});
