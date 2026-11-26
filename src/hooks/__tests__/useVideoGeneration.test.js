import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import useVideoGeneration from "../useVideoGeneration";
import {
  createVideoProject,
  downloadVideo,
  downloadVideoSegment,
  renderVideoProject,
  retryVideoProject,
  waitForVideoProject,
  waitForVideoRender,
} from "../../services/aiService";

vi.mock("../../services/aiService", () => ({
  createVideoProject: vi.fn(),
  downloadVideo: vi.fn(),
  downloadVideoSegment: vi.fn(),
  draftVideoStoryboard: vi.fn(),
  renderVideoProject: vi.fn(),
  retryVideoProject: vi.fn(),
  waitForVideoProject: vi.fn(),
  waitForVideoRender: vi.fn(),
}));

const storyboard = { title: "晨光森林", global: {}, shots: [] };

const segment = (index) => ({
  index,
  jobId: `job-${index}`,
  status: "succeeded",
  durationSeconds: 10,
  prompt: `prompt-${index}`,
});

const finish = (count) => {
  const segments = Array.from({ length: count }, (_, index) => segment(index));
  createVideoProject.mockResolvedValue({ projectId: "p1", segments });
  waitForVideoProject.mockResolvedValue({ projectId: "p1", status: "succeeded", segments });
};

describe("useVideoGeneration", () => {
  beforeEach(() => {
    downloadVideoSegment.mockImplementation(async ({ jobId }) => new Blob([jobId]));
    downloadVideo.mockResolvedValue(new Blob(["merged"]));
    globalThis.URL.createObjectURL = vi.fn((blob) => `blob:${blob.size}-${Math.random()}`);
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("saves a single-segment project to history with its prompt", async () => {
    finish(1);
    const onSaved = vi.fn();
    const { result } = renderHook(() => useVideoGeneration({ onSaved }));

    await act(() => result.current.submit({ storyboard, modelKey: "kling", mode: "t2v" }));

    expect(createVideoProject).toHaveBeenCalledWith({ modelKey: "kling", storyboard, mode: "t2v" });
    expect(onSaved).toHaveBeenCalledWith({ videoProjectId: "p1", userScript: "晨光森林", fullPrompt: "prompt-0" });
    expect(result.current.turns[0]).toMatchObject({ status: "succeeded", videoUrls: [expect.any(String)] });
  });

  it("downloads every segment in order and does not save a multi-segment project", async () => {
    finish(3);
    const onSaved = vi.fn();
    const { result } = renderHook(() => useVideoGeneration({ onSaved }));

    await act(() => result.current.submit({ storyboard, modelKey: "kling", mode: "t2v" }));

    expect(downloadVideoSegment.mock.calls.map(([args]) => args.jobId)).toEqual(["job-0", "job-1", "job-2"]);
    expect(result.current.turns[0].videoUrls).toHaveLength(3);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("makes each segment playable as soon as it succeeds and reuses it when the project finishes", async () => {
    const segments = [segment(0), { ...segment(1), status: "processing" }];
    createVideoProject.mockResolvedValue({ projectId: "p1", segments });
    let finishProject;
    waitForVideoProject.mockImplementation(({ onProgress }) => {
      onProgress({ projectId: "p1", status: "processing", segments });
      return new Promise((resolve) => { finishProject = resolve; });
    });
    const { result } = renderHook(() => useVideoGeneration({ onSaved: vi.fn() }));

    let submitted;
    await act(async () => {
      submitted = result.current.submit({ storyboard, modelKey: "kling", mode: "t2v" });
    });
    expect(result.current.turns[0]).toMatchObject({ status: "processing", segmentUrls: { "job-0": expect.any(String) } });
    expect(result.current.turns[0].videoUrls).toBeUndefined();

    await act(async () => {
      finishProject({ projectId: "p1", status: "succeeded", segments: [segment(0), segment(1)] });
      await submitted;
    });
    expect(downloadVideoSegment.mock.calls.map(([args]) => args.jobId)).toEqual(["job-0", "job-1"]);
    expect(result.current.turns[0].videoUrls).toEqual([
      result.current.turns[0].segmentUrls["job-0"],
      result.current.turns[0].segmentUrls["job-1"],
    ]);
  });

  it("merges a multi-segment project into one video, replaces the segments and saves it", async () => {
    finish(2);
    const onSaved = vi.fn();
    const { result } = renderHook(() => useVideoGeneration({ onSaved }));
    await act(() => result.current.submit({ storyboard, modelKey: "kling", mode: "t2v" }));
    const segmentUrls = result.current.turns[0].videoUrls;

    await act(() => result.current.merge(result.current.turns[0]));

    expect(renderVideoProject).toHaveBeenCalledWith({ projectId: "p1" });
    expect(downloadVideo).toHaveBeenCalledWith(expect.objectContaining({ projectId: "p1" }));
    expect(onSaved).toHaveBeenCalledWith({
      videoProjectId: "p1",
      userScript: "晨光森林",
      fullPrompt: "prompt-0\n\nprompt-1",
    });
    expect(URL.revokeObjectURL.mock.calls.map(([url]) => url)).toEqual(segmentUrls);
    expect(result.current.turns[0]).toMatchObject({ mergeStatus: "merged", videoUrls: [expect.any(String)] });
  });

  it("retries only the failed segments of a failed turn and then finishes it", async () => {
    const segments = [segment(0), segment(1)];
    createVideoProject.mockResolvedValue({ projectId: "p1", segments });
    waitForVideoProject.mockRejectedValueOnce(new Error("第 2 段：內容未通過安全檢查"));
    const { result } = renderHook(() => useVideoGeneration({ onSaved: vi.fn() }));
    await act(async () => {
      await result.current.submit({ storyboard, modelKey: "kling", mode: "t2v" }).catch(() => {});
    });
    expect(result.current.turns[0]).toMatchObject({ status: "failed", error: "第 2 段：內容未通過安全檢查" });

    retryVideoProject.mockResolvedValue({ projectId: "p1", status: "processing", segments });
    waitForVideoProject.mockResolvedValue({ projectId: "p1", status: "succeeded", segments });
    await act(() => result.current.retryFailed(result.current.turns[0]));

    expect(retryVideoProject).toHaveBeenCalledWith({ projectId: "p1" });
    expect(createVideoProject).toHaveBeenCalledTimes(1);
    expect(result.current.turns[0]).toMatchObject({ status: "succeeded", error: null, videoUrls: [expect.any(String), expect.any(String)] });
  });

  it("shows the error when the retry is rejected", async () => {
    finish(1);
    const { result } = renderHook(() => useVideoGeneration({ onSaved: vi.fn() }));
    await act(() => result.current.submit({ storyboard, modelKey: "kling", mode: "t2v" }));
    retryVideoProject.mockRejectedValue(new Error("今日影片額度已用完，請明天再試"));

    await act(() => result.current.retryFailed(result.current.turns[0]));

    expect(result.current.turns[0]).toMatchObject({ status: "failed", error: "今日影片額度已用完，請明天再試" });
  });

  it("keeps the segments and shows the error when merging fails", async () => {
    finish(2);
    const { result } = renderHook(() => useVideoGeneration({ onSaved: vi.fn() }));
    await act(() => result.current.submit({ storyboard, modelKey: "kling", mode: "t2v" }));
    waitForVideoRender.mockRejectedValue(new Error("影片合併逾時，請重新合併"));

    await act(() => result.current.merge(result.current.turns[0]));

    expect(downloadVideo).not.toHaveBeenCalled();
    expect(result.current.turns[0]).toMatchObject({
      mergeStatus: "failed",
      mergeError: "影片合併逾時，請重新合併",
      videoUrls: [expect.any(String), expect.any(String)],
    });
  });

  it("resumes a saved session without saving its turns to history again", async () => {
    finish(1);
    const onSaved = vi.fn();
    const initialTurns = [
      { clientId: "a", createdAt: 1, storyboard, projectId: "p1", status: "polling", segments: [], saved: false },
      { clientId: "b", createdAt: 2, storyboard, projectId: "p2", status: "succeeded", segments: [segment(0)], saved: true },
      { clientId: "c", createdAt: 3, brief: "海邊", status: "drafting" },
    ];
    const { result } = renderHook(() => useVideoGeneration({ onSaved, initialTurns }));

    await act(async () => {});

    expect(waitForVideoProject.mock.calls.map(([args]) => args.projectId)).toEqual(["p1", "p2"]);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ videoProjectId: "p1" }));
    expect(result.current.turns.map((turn) => [turn.status, Boolean(turn.saved)])).toEqual([
      ["succeeded", true],
      ["succeeded", true],
      ["failed", false],
    ]);
    expect(result.current.turns[2].error).toBe("已中斷，請重新生成");
  });

  it("reloads a merged turn as one video and keeps failed segments retryable", async () => {
    const failed = { ...segment(1), status: "failed" };
    const initialTurns = [
      { clientId: "a", createdAt: 1, storyboard, projectId: "p1", status: "succeeded", segments: [segment(0), segment(1)], mergeStatus: "merged", saved: true },
      { clientId: "b", createdAt: 2, storyboard, projectId: "p2", status: "failed", segments: [segment(0), failed], error: "失敗" },
    ];
    const { result } = renderHook(() => useVideoGeneration({ onSaved: vi.fn(), initialTurns }));

    await act(async () => {});

    expect(downloadVideo).toHaveBeenCalledWith(expect.objectContaining({ projectId: "p1" }));
    expect(waitForVideoProject).not.toHaveBeenCalled();
    expect(result.current.turns[0].videoUrls).toHaveLength(1);
    expect(result.current.turns[1]).toMatchObject({ status: "failed", error: "失敗" });
  });});
