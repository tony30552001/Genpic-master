import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import StoryboardProgress from "../StoryboardProgress";
import { DraftingShots } from "../StoryboardParts";

afterEach(cleanup);

const progress = {
  steps: ["reading", "thinking", "writing", "checking", "images"],
  step: "writing",
  reasoning: "**對齊場景** 先確認每場的動作",
  expectedShots: 3,
  shots: [{ title: "作業前準備", duration: 5, text: "推車停在病房門口" }],
};

describe("StoryboardProgress", () => {
  it("shows a waiting line until the job reports progress", () => {
    render(<StoryboardProgress progress={null} waitingLabel="AI 正在擬分鏡…" />);
    expect(screen.getByRole("status").textContent).toBe("AI 正在擬分鏡…");
  });

  it("marks finished, running and upcoming steps with the scene count and reasoning", () => {
    render(<StoryboardProgress progress={progress} waitingLabel="AI 正在擬分鏡…" />);

    const steps = within(screen.getByRole("list", { name: "分鏡進度" })).getAllByRole("listitem");
    expect(steps.map((step) => step.textContent)).toEqual([
      "讀取文件", "AI 構思分鏡", "AI 撰寫分鏡已完成 1／3 幕", "檢查分鏡", "匯入參考圖",
    ]);
    expect(steps[2].getAttribute("aria-current")).toBe("step");
    expect(screen.getByText("AI 撰寫分鏡，已完成 1／3 幕")).toBeTruthy();
    expect(screen.getByText("思考過程")).toBeTruthy();
  });
});

describe("DraftingShots", () => {
  it("shows finished shots and a placeholder for each scene still being written", () => {
    const { container } = render(<DraftingShots progress={progress} />);

    expect(screen.getByRole("article", { name: "第 1 幕（擬稿中）" }).textContent).toContain("推車停在病房門口");
    expect(container.querySelectorAll(".storyboard-skeleton")).toHaveLength(2);
  });
});
