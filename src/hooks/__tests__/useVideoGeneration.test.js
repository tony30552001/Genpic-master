import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import useVideoGeneration from "../useVideoGeneration";
import { cancelVideoProject, createVideoProject, draftVideoStoryboard, renderVideoProject, retryVideoProject, waitForVideoProject, waitForVideoRender } from "../../services/aiService";

vi.mock("../../services/aiService", () => ({
  cancelVideoProject: vi.fn(), createVideoProject: vi.fn(), draftVideoStoryboard: vi.fn(), renderVideoProject: vi.fn(),
  retryVideoProject: vi.fn(), waitForVideoProject: vi.fn(), waitForVideoRender: vi.fn(),
}));

const storyboard = { title: "晨光森林", global: {}, shots: [] };
const request = { storyboard, modelKey: "kling", mode: "t2v" };
const segment = (index, status = "succeeded") => ({ index, jobId: `j${index}`, status, prompt: `prompt-${index}` });
const setup = (segments, initialTurns) => {
  const project = { projectId: "p1", status: "succeeded", segments };
  createVideoProject.mockResolvedValue(project);
  waitForVideoProject.mockResolvedValue(project);
  const onSaved = vi.fn();
  const onMerged = vi.fn();
  return { ...renderHook(() => useVideoGeneration({ onSaved, onMerged, initialTurns })), onSaved, onMerged, project };
};

beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

describe("useVideoGeneration", () => {
  it("saves a single segment once and keeps the project identity for streaming", async () => {
    const { result, onSaved } = setup([segment(0)]);
    await act(() => result.current.submit({ ...request, baseProjectId: "base" }));
    expect(createVideoProject).toHaveBeenCalledWith({ ...request, baseProjectId: "base" });
    expect(onSaved).toHaveBeenCalledWith({ videoProjectId: "p1", userScript: storyboard.title, fullPrompt: "prompt-0" });
    expect(result.current.turns[0]).toMatchObject({ status: "succeeded", saved: true, projectId: "p1", options: { mode: "t2v" } });
    expect(waitForVideoRender).not.toHaveBeenCalled();
  });

  it("publishes each segment before the rest finish, then follows the backend merge without posting to render or history", async () => {
    const { result, onSaved, onMerged, project } = setup([segment(0), segment(1)]);
    let finish;
    waitForVideoProject.mockImplementation(({ onProgress }) => {
      onProgress({ ...project, status: "processing", segments: [segment(0), segment(1, "processing")] });
      return new Promise((resolve) => { finish = resolve; });
    });
    let submitted;
    await act(async () => { submitted = result.current.submit(request); });
    expect(result.current.turns[0]).toMatchObject({ status: "processing", segments: [segment(0), segment(1, "processing")] });
    expect(result.current.turns[0]).not.toHaveProperty("videoUrls");
    await act(async () => { finish(project); await submitted; });
    expect(result.current.turns[0]).toMatchObject({ status: "succeeded", mergeStatus: "merged", saved: true });
    expect(renderVideoProject).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onMerged).toHaveBeenCalledOnce();
  });

  it("keeps finished segments after a render failure and only queues a new render on retry", async () => {
    const { result, onSaved } = setup([segment(0), segment(1)]);
    waitForVideoRender.mockRejectedValueOnce(new Error("合併逾時"));
    await act(() => result.current.submit(request));
    expect(result.current.turns[0]).toMatchObject({ status: "succeeded", mergeStatus: "failed", mergeError: "合併逾時" });
    await act(() => result.current.retryMerge(result.current.turns[0]));
    expect(renderVideoProject).toHaveBeenCalledWith({ projectId: "p1" });
    expect(createVideoProject).toHaveBeenCalledOnce();
    expect(onSaved).not.toHaveBeenCalled();
    expect(result.current.turns[0]).toMatchObject({ mergeStatus: "merged", saved: true });
  });

  it("cancels at the backend and ignores an older poll result after cancellation", async () => {
    const { result, project, onSaved } = setup([segment(0, "queued")]);
    let finish;
    waitForVideoProject.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    let submitted;
    await act(async () => { submitted = result.current.submit(request); });
    cancelVideoProject.mockResolvedValue({ ...project, status: "cancelled", segments: [segment(0, "cancelled")] });
    await act(() => result.current.cancel(result.current.turns[0]));
    await act(async () => { finish(project); await submitted; });
    expect(cancelVideoProject).toHaveBeenCalledWith({ projectId: "p1" });
    expect(result.current.turns[0]).toMatchObject({ status: "cancelled", segments: [segment(0, "cancelled")] });
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("stops a pending draft without admitting a video, even if the draft eventually resolves", async () => {
    const { result } = setup([segment(0)]);
    let finish, submitted;
    draftVideoStoryboard.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    await act(async () => { submitted = result.current.submit({ brief: "晨光", modelKey: "kling" }); });
    await act(() => result.current.cancel(result.current.turns[0]));
    await act(async () => { finish({ storyboard }); await submitted; });
    expect(result.current.turns[0].status).toBe("cancelled");
    expect(createVideoProject).not.toHaveBeenCalled();
    expect(cancelVideoProject).not.toHaveBeenCalled();
  });

  it("resumes unfinished renders but does not poll cancelled or archived turns", async () => {
    const base = { storyboard, segments: [segment(0), segment(1)], status: "succeeded" };
    const { result, onSaved } = setup(base.segments, [
      { ...base, clientId: "a", projectId: "p1", mergeStatus: "merging" },
      { ...base, clientId: "b", projectId: "p2", status: "cancelled" },
      { ...base, clientId: "c", projectId: "p3", saved: true, mergeStatus: "merged" },
      { clientId: "d", status: "drafting" },
    ]);
    await act(async () => {});
    expect(waitForVideoProject.mock.calls.map(([args]) => args.projectId)).toEqual(["p1"]);
    expect(result.current.turns.map((turn) => turn.status)).toEqual(["succeeded", "cancelled", "succeeded", "failed"]);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("retries a failed project and restores the original turn if an edited replacement is not admitted", async () => {
    const { result } = setup([segment(0)]);
    waitForVideoProject.mockRejectedValueOnce(new Error("分段失敗"));
    await act(async () => { await expect(result.current.submit(request)).rejects.toThrow("分段失敗"); });
    await act(() => result.current.retryFailed(result.current.turns[0]));
    expect(retryVideoProject).toHaveBeenCalledWith({ projectId: "p1" });
    const original = result.current.turns[0];
    createVideoProject.mockRejectedValueOnce(new Error("額度已用完"));
    await act(async () => {
      await expect(result.current.submit({ ...request, replace: original, baseProjectId: "p1" })).rejects.toThrow("額度已用完");
    });
    expect(result.current.turns).toEqual([original]);
  });
});
