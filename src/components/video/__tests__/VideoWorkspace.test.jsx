import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import VideoWorkspace from "../VideoWorkspace";

vi.mock("@/hooks/useMediaQuery", () => ({
  MOBILE_LAYOUT_QUERY: "(max-width: 1023px)",
  useMediaQuery: () => false,
}));

vi.mock("@/hooks/useVideoGeneration", () => ({
  default: () => ({
    turns: [],
    activeTurnId: null,
    setActiveTurnId: vi.fn(),
    submit: vi.fn(),
    retryFailed: vi.fn(),
    mergeTurn: vi.fn(),
    cancelTurn: vi.fn(),
    cancelSegment: vi.fn(),
  }),
}));

vi.mock("@/hooks/useVideoStoryboard", () => ({
  default: () => ({
    messages: [],
    board: null,
    pending: null,
    pendingJob: null,
    inspection: { status: "idle" },
    draft: vi.fn(),
    fromScript: vi.fn(),
    importScript: vi.fn(),
    draftFromDocument: vi.fn(),
    revise: vi.fn(),
    open: vi.fn(),
    close: vi.fn(),
    cancel: vi.fn(),
  }),
}));

afterEach(cleanup);

const KLING = {
  modelKey: "fal-kling-v3-pro",
  label: "Kling-V3-Pro",
  family: "kling-v3-pro",
  maxDurationSeconds: 15,
  maxResolution: null,
  allowAudio: false,
  capabilities: {
    minDuration: 3,
    maxDuration: 15,
    resolutions: ["1080P"],
    aspectRatios: ["16:9", "9:16", "1:1"],
    supportsAudioToggle: true,
  },
};

const MINIMAX = {
  modelKey: "fal-minimax-h3-max",
  label: "MiniMax-H3-Max",
  family: "minimax-h3-max",
  maxDurationSeconds: 15,
  maxResolution: "1080P",
  allowAudio: true,
  capabilities: {
    minDuration: 1,
    maxDuration: 15,
    resolutions: ["480P", "768P", "1080P"],
    aspectRatios: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
    supportsAudioToggle: false,
  },
};

const createSessions = (initialState = null) => ({
  activeId: null,
  title: "",
  saveStatus: "saved",
  error: "",
  items: [],
  hasMore: false,
  isLoading: false,
  getInitialState: () => initialState,
  record: vi.fn(),
  open: vi.fn(),
  loadMore: vi.fn(),
  startNew: vi.fn(),
  remove: vi.fn(),
});

describe("VideoWorkspace default model", () => {
  it("selects MiniMax by default even when Kling is listed first", () => {
    render(
      <VideoWorkspace
        models={[KLING, MINIMAX]}
        settings={{ remainingQuota: 5 }}
        sessions={createSessions()}
      />
    );

    expect(screen.getByRole("button", { name: "影片模型：MiniMax-H3-Max" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "影片設定：5 秒 · 16:9 · 768P" })).toBeInTheDocument();
  });

  it("preserves the saved model when restoring a session", () => {
    render(
      <VideoWorkspace
        models={[KLING, MINIMAX]}
        settings={{ remainingQuota: 5 }}
        sessions={createSessions({
          brief: "",
          messages: [],
          turns: [],
          settings: { modelKey: KLING.modelKey, durationSeconds: 5, resolution: "1080P", aspectRatio: "16:9" },
        })}
      />
    );

    expect(screen.getByRole("button", { name: "影片模型：Kling-V3-Pro" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "影片設定：5 秒 · 16:9" })).toBeInTheDocument();
  });

  it("falls back to the first available model when MiniMax is not enabled", () => {
    render(
      <VideoWorkspace
        models={[KLING]}
        settings={{ remainingQuota: 5 }}
        sessions={createSessions()}
      />
    );

    expect(screen.getByRole("button", { name: "影片模型：Kling-V3-Pro" })).toBeInTheDocument();
  });
});
