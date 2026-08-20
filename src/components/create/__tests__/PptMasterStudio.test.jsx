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
  slides: [],
  slidePreviews: {},
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

describe("PptMasterStudio slide previews", () => {
  beforeEach(() => {
    deckState.current = { ...baseState };
  });

  afterEach(() => cleanup());

  it("hides the rail until a deck is being generated", () => {
    render(<PptMasterStudio />);

    expect(screen.queryByText("投影片預覽")).not.toBeInTheDocument();
  });

  it("shows the rail with a placeholder for every planned page while generating", () => {
    deckState.current = {
      ...baseState,
      isGenerating: true,
      progress: { phase: "逐頁設計版面", current: 1, total: 4, startedAt: null },
      events: [{ id: 1, step: "slides", status: "running", slideNumber: 2, detail: "設計第 2 頁" }],
      slides: [{ slideNumber: 1, revision: 1, title: "封面" }],
      slidePreviews: { 1: { revision: 1, title: "封面", url: "blob:slide-1" } },
    };

    render(<PptMasterStudio />);

    expect(screen.getByText("投影片預覽")).toBeInTheDocument();
    expect(screen.getByText("1/4")).toBeInTheDocument();
    expect(screen.getByAltText("第 1 頁預覽")).toHaveAttribute("src", "blob:slide-1");
  });

  it("enlarges the chosen page next to the progress card", async () => {
    const user = userEvent.setup();
    deckState.current = {
      ...baseState,
      isGenerating: true,
      progress: { phase: "逐頁設計版面", current: 1, total: 2, startedAt: null },
      slides: [{ slideNumber: 1, revision: 1, title: "封面" }],
      slidePreviews: { 1: { revision: 1, title: "封面", url: "blob:slide-1" } },
    };

    render(<PptMasterStudio />);
    await user.click(screen.getByRole("button", { name: "第 1 頁：封面" }));

    expect(screen.getAllByAltText("第 1 頁預覽")).toHaveLength(2);
    expect(screen.getByText("第 1 頁：封面")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "關閉放大預覽" }));
    expect(screen.getAllByAltText("第 1 頁預覽")).toHaveLength(1);
  });
});

describe("PptMasterStudio image density", () => {
  beforeEach(() => {
    deckState.current = { ...baseState, generate: vi.fn().mockResolvedValue(undefined) };
  });

  afterEach(() => cleanup());

  it("defaults to illustrating the key pages", () => {
    render(<PptMasterStudio />);

    expect(screen.getByRole("button", { name: /重點配圖/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("sends the chosen density to the generator", async () => {
    const user = userEvent.setup();
    render(<PptMasterStudio />);

    await user.type(screen.getByLabelText("簡報主題"), "生成式 AI 導入策略");
    await user.click(screen.getByRole("button", { name: /每頁配圖/ }));
    await user.click(screen.getByRole("button", { name: /產生簡報/ }));

    expect(deckState.current.generate).toHaveBeenCalledWith(
      expect.objectContaining({ imageDensity: "every" })
    );
  });
});
