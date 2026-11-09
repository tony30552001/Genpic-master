import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ChatThread from "../ChatThread";

const assistant = (overrides = {}) => ({
  id: "m-1",
  turnId: "t-1",
  role: "assistant",
  content: "",
  images: [],
  status: "responding",
  error: null,
  input: {},
  ...overrides,
});

const renderThread = (message) =>
  render(
    <ChatThread
      messages={[message]}
      hasOlderMessages={false}
      onLoadOlder={vi.fn()}
      isLoading={false}
      selectedJobId={null}
      onSelectVersion={vi.fn()}
      getVersion={() => null}
    />
  );

afterEach(cleanup);

describe("ChatThread reasoning", () => {
  it("shows a plain thinking placeholder until a summary arrives, then expands it on click", () => {
    const { rerender } = renderThread(assistant());
    expect(screen.getByText("思考中…")).toBeInTheDocument();
    expect(screen.queryByRole("group")).not.toBeInTheDocument();

    rerender(
      <ChatThread
        messages={[assistant({ input: { reasoning: "**確認需求**\n\n資訊足夠，直接畫。" } })]}
        hasOlderMessages={false}
        onLoadOlder={vi.fn()}
        isLoading={false}
        selectedJobId={null}
        onSelectVersion={vi.fn()}
        getVersion={() => null}
      />
    );
    const details = screen.getByText("思考中…").closest("details");
    expect(details).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("思考中…"));
    expect(details).toHaveAttribute("open");
    expect(screen.getByText("資訊足夠，直接畫。")).toBeInTheDocument();
  });

  it("keeps a finished reply's reasoning behind a collapsed 已思考 label", () => {
    renderThread(assistant({ status: "completed", content: "好的。", input: { reasoning: "先確認" } }));

    expect(screen.queryByText("思考中…")).not.toBeInTheDocument();
    expect(screen.getByText("已思考").closest("details")).not.toHaveAttribute("open");
  });

  it("shows nothing for a finished reply without a summary", () => {
    renderThread(assistant({ status: "completed", content: "好的。" }));

    expect(screen.queryByText("已思考")).not.toBeInTheDocument();
  });
});

describe("ChatThread web searches", () => {
  it("shows a running search instead of the thinking placeholder", () => {
    renderThread(assistant({ input: { searches: [{ id: "ws_1", status: "searching", query: "", sources: [] }] } }));

    expect(screen.getByText("正在搜尋網路…")).toBeInTheDocument();
    expect(screen.queryByText("思考中…")).not.toBeInTheDocument();
  });

  it("lists a finished search's sources as external links", () => {
    renderThread(assistant({
      status: "completed",
      content: "主燈是駿馬。",
      input: {
        searches: [
          {
            id: "ws_1",
            status: "completed",
            query: "台北燈會 主燈",
            sources: [
              { url: "https://lantern.example.com/a", title: "燈會官網" },
              { url: "https://www.news.example.com/b", title: "" },
            ],
          },
          { id: "ws_2", status: "failed", query: "主燈 尺寸", sources: [] },
        ],
      },
    }));

    fireEvent.click(screen.getByText("已搜尋網路：台北燈會 主燈"));
    const official = screen.getByRole("link", { name: "燈會官網" });
    expect(official).toHaveAttribute("href", "https://lantern.example.com/a");
    expect(official).toHaveAttribute("target", "_blank");
    expect(official).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("link", { name: "news.example.com" })).toBeInTheDocument();
    expect(screen.getByText("搜尋網路失敗：主燈 尺寸")).toBeInTheDocument();
  });
});
