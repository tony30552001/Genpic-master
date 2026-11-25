import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import useVideoGeneration from "../useVideoGeneration";
import { createVideoProject, downloadVideo, waitForVideoProject } from "../../services/aiService";

vi.mock("../../services/aiService", () => ({
  createVideoProject: vi.fn(),
  downloadVideo: vi.fn(),
  draftVideoStoryboard: vi.fn(),
  waitForVideoProject: vi.fn(),
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
    downloadVideo.mockImplementation(async ({ jobId }) => new Blob([jobId]));
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
    expect(onSaved).toHaveBeenCalledWith({ videoJobId: "job-0", userScript: "晨光森林", fullPrompt: "prompt-0" });
    expect(result.current.turns[0]).toMatchObject({ status: "succeeded", videoUrls: [expect.any(String)] });
  });

  it("downloads every segment in order and does not save a multi-segment project", async () => {
    finish(3);
    const onSaved = vi.fn();
    const { result } = renderHook(() => useVideoGeneration({ onSaved }));

    await act(() => result.current.submit({ storyboard, modelKey: "kling", mode: "t2v" }));

    expect(downloadVideo.mock.calls.map(([args]) => args.jobId)).toEqual(["job-0", "job-1", "job-2"]);
    expect(result.current.turns[0].videoUrls).toHaveLength(3);
    expect(onSaved).not.toHaveBeenCalled();
  });
});
