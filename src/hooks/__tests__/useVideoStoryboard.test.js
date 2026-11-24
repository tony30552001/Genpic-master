import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import useVideoStoryboard from "../useVideoStoryboard";
import {
  draftVideoStoryboard,
  inspectVideoStoryboard,
  reviseVideoStoryboard,
} from "../../services/aiService";

vi.mock("../../services/aiService", () => ({
  draftVideoStoryboard: vi.fn(),
  inspectVideoStoryboard: vi.fn(),
  reviseVideoStoryboard: vi.fn(),
  scriptToVideoStoryboard: vi.fn(),
}));

const shot = (id, action) => ({
  id,
  title: null,
  script: null,
  scriptOriginal: null,
  duration: 3,
  shotSize: "medium",
  angle: "eye-level",
  camera: "static",
  action,
  environment: "",
});

const storyboard = {
  title: "晨光森林",
  global: { style: "寫實", lighting: "晨光", constraints: [], negative: "" },
  shots: [shot("s1", "鏡頭穿過樹林"), shot("s2", "陽光灑落")],
};

const compiled = { sendMode: "multi", prompt: null, multiPrompt: [], negativePrompt: null };

const agentResult = (overrides = {}) => ({
  storyboard,
  warnings: [{ shotId: "s2", code: "static_action", message: "固定鏡頭缺少動作" }],
  compiled,
  explanation: "拆成兩幕",
  questions: ["要加字幕嗎？"],
  ...overrides,
});

describe("useVideoStoryboard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    draftVideoStoryboard.mockResolvedValue(agentResult());
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("drafts a board and records the agent reply with a summary", async () => {
    const { result } = renderHook(() => useVideoStoryboard({ modelKey: "kling", hasStartFrame: false }));

    await act(() => result.current.draft({ brief: "森林晨光", durationSeconds: 6 }));

    expect(draftVideoStoryboard).toHaveBeenCalledWith(
      expect.objectContaining({ modelKey: "kling", brief: "森林晨光", durationSeconds: 6, hasStartFrame: false })
    );
    expect(result.current.board.storyboard).toEqual(storyboard);
    expect(result.current.inspection.status).toBe("ready");
    expect(result.current.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(result.current.messages[1].summary).toEqual({
      title: "晨光森林",
      seconds: 6,
      shots: [{ id: "s1", warned: false }, { id: "s2", warned: true }],
    });
  });

  it("debounces inspection after an edit and keeps the edited storyboard", async () => {
    inspectVideoStoryboard.mockResolvedValue({ warnings: [], compiled: { ...compiled, sendMode: "single" } });
    const { result } = renderHook(() => useVideoStoryboard({ modelKey: "kling", hasStartFrame: false }));
    await act(() => result.current.draft({ brief: "森林晨光", durationSeconds: 6 }));

    act(() => result.current.edit((current) => ({ ...current, shots: current.shots.slice(0, 1) })));
    expect(result.current.inspection.status).toBe("loading");
    expect(inspectVideoStoryboard).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(400));

    expect(inspectVideoStoryboard).toHaveBeenCalledTimes(1);
    expect(result.current.board.storyboard.shots).toHaveLength(1);
    expect(result.current.board.warnings).toEqual([]);
    expect(result.current.board.compiled.sendMode).toBe("single");
    expect(result.current.inspection.status).toBe("ready");
  });

  it("treats the result as stale and re-inspects when the model changes", async () => {
    inspectVideoStoryboard.mockResolvedValue({ warnings: [], compiled });
    const { result, rerender } = renderHook((props) => useVideoStoryboard(props), {
      initialProps: { modelKey: "kling", hasStartFrame: false },
    });
    await act(() => result.current.draft({ brief: "森林晨光", durationSeconds: 6 }));

    rerender({ modelKey: "minimax", hasStartFrame: false });
    expect(result.current.inspection.status).toBe("loading");

    await act(() => vi.advanceTimersByTimeAsync(400));
    expect(inspectVideoStoryboard).toHaveBeenCalledWith(expect.objectContaining({ modelKey: "minimax" }));
    expect(result.current.inspection.status).toBe("ready");
  });

  it("surfaces an invalid storyboard from inspection", async () => {
    inspectVideoStoryboard.mockRejectedValue(new Error("第 1 幕缺少動作"));
    const { result } = renderHook(() => useVideoStoryboard({ modelKey: "kling", hasStartFrame: false }));
    await act(() => result.current.draft({ brief: "森林晨光", durationSeconds: 6 }));

    act(() => result.current.edit((current) => current, "s1"));
    await act(() => vi.advanceTimersByTimeAsync(400));

    expect(result.current.inspection).toMatchObject({ status: "invalid", error: "第 1 幕缺少動作" });
  });

  it("revises one shot and marks only that shot as changed", async () => {
    reviseVideoStoryboard.mockResolvedValue(agentResult({ changedShotIds: ["s2"], explanation: "已改第 2 幕" }));
    const { result } = renderHook(() => useVideoStoryboard({ modelKey: "kling", hasStartFrame: true }));
    await act(() => result.current.draft({ brief: "森林晨光", durationSeconds: 6 }));

    await act(() => result.current.revise({ instruction: "更具體", shotId: "s2", label: "請 AI 重寫第 2 幕" }));

    expect(reviseVideoStoryboard).toHaveBeenCalledWith(
      expect.objectContaining({ storyboard, instruction: "更具體", shotId: "s2", hasStartFrame: true })
    );
    expect(result.current.board.changedShotIds).toEqual(["s2"]);
    expect(result.current.board.revision).toBe(2);
    expect(result.current.messages.at(-2).text).toBe("請 AI 重寫第 2 幕");
  });

  it("shows agent failures in the conversation", async () => {
    draftVideoStoryboard.mockRejectedValue(new Error("分鏡 AI 逾時"));
    const { result } = renderHook(() => useVideoStoryboard({ modelKey: "kling", hasStartFrame: false }));

    await act(() => result.current.draft({ brief: "森林晨光", durationSeconds: 6 }));

    expect(result.current.board).toBeNull();
    expect(result.current.pending).toBeNull();
    expect(result.current.messages.at(-1)).toMatchObject({ kind: "error", text: "分鏡 AI 逾時" });
  });
});
