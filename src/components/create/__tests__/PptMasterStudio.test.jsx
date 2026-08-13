import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deckState = vi.hoisted(() => ({ current: null }));

vi.mock("@/hooks/usePptMasterDeck", () => ({
  default: () => deckState.current,
}));

import PptMasterStudio from "../PptMasterStudio";

const baseState = {
  templates: {
    styles: [{ id: "consulting-decision", name: "Consulting Decision", summary: "" }],
    layouts: [{ id: "presentation_core", name: "Presentation Core", summary: "", pageCount: 20 }],
  },
  templatesError: null,
  isGenerating: false,
  progress: { phase: "", current: 0, total: 0, startedAt: null },
  events: [],
  deck: null,
  error: null,
  generate: vi.fn(),
  stopWatching: vi.fn(),
  download: vi.fn(),
  reset: vi.fn(),
};

describe("PptMasterStudio setup collapsing", () => {
  beforeEach(() => {
    deckState.current = { ...baseState };
  });

  afterEach(() => cleanup());

  it("shows the full form while idle", () => {
    render(<PptMasterStudio />);

    expect(screen.getByLabelText("簡報主題")).toBeInTheDocument();
    expect(screen.queryByText("查看設定")).not.toBeInTheDocument();
  });

  it("collapses the setup cards while generating", () => {
    deckState.current = {
      ...baseState,
      isGenerating: true,
      progress: { phase: "逐頁設計版面", current: 3, total: 8, startedAt: null },
      events: [{ id: 1, step: "slides", status: "running", detail: "逐頁設計版面，共 8 頁" }],
    };

    render(<PptMasterStudio />);

    expect(screen.queryByLabelText("簡報主題")).not.toBeInTheDocument();
    expect(screen.getByText("查看設定")).toBeInTheDocument();
    expect(screen.getByText("AI 正在設計你的簡報")).toBeInTheDocument();
  });

  it("re-opens the setup on demand without losing the progress card", async () => {
    const user = userEvent.setup();
    deckState.current = {
      ...baseState,
      isGenerating: true,
      progress: { phase: "逐頁設計版面", current: 3, total: 8, startedAt: null },
      events: [{ id: 1, step: "slides", status: "running", detail: "逐頁設計版面，共 8 頁" }],
    };

    render(<PptMasterStudio />);
    await user.click(screen.getByRole("button", { name: /查看設定/ }));

    expect(screen.getByLabelText("簡報主題")).toBeInTheDocument();
    expect(screen.getByText("收合設定")).toBeInTheDocument();
    expect(screen.getByText("AI 正在設計你的簡報")).toBeInTheDocument();
  });

  it("keeps the setup collapsed once the deck is ready", () => {
    deckState.current = {
      ...baseState,
      deck: { jobId: "deck-1", title: "AI 導入策略", slideCount: 8, fileName: "a.pptx" },
    };

    render(<PptMasterStudio />);

    expect(screen.queryByLabelText("簡報主題")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /下載 PPTX/ })).toBeInTheDocument();
  });
});
