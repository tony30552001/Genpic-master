import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import DeckTimeline from "../DeckTimeline";

const events = [
  { id: 1, step: "source", status: "skipped", detail: "直接依主題生成，未使用參考文件" },
  { id: 2, step: "outline", status: "succeeded", detail: "《AI 導入》共 6 頁" },
  { id: 3, step: "slides", status: "running", detail: "逐頁設計版面，共 6 頁" },
  { id: 4, step: "slides", status: "succeeded", slideNumber: 1, detail: "第 1 頁完成" },
  { id: 5, step: "slides", status: "running", slideNumber: 2, detail: "設計第 2 頁：現況" },
];

describe("DeckTimeline", () => {
  afterEach(() => cleanup());

  it("renders every step label with the running step expanded", () => {
    render(<DeckTimeline events={events} />);

    expect(screen.getByText("解析素材")).toBeInTheDocument();
    expect(screen.getByText("匯出 PowerPoint")).toBeInTheDocument();
    expect(screen.getByText("第 1 頁完成")).toBeInTheDocument();
    expect(screen.getByText("設計第 2 頁：現況")).toBeInTheDocument();
    expect(screen.getByRole("button", { expanded: true })).toBeInTheDocument();
  });

  it("collapses the slide details on demand", async () => {
    const user = userEvent.setup();
    render(<DeckTimeline events={events} />);

    await user.click(screen.getByRole("button", { expanded: true }));

    expect(screen.queryByText("第 1 頁完成")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { expanded: false })).toBeInTheDocument();
  });

  it("renders without events", () => {
    render(<DeckTimeline events={[]} />);
    expect(screen.getByText("規劃簡報大綱")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
