import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import useVideoStoryboard from "../useVideoStoryboard";
import { storyboardActions } from "../../components/video/storyboard/storyboardActions";
import { uploadFile } from "../../services/storageService";
import {
  draftVideoStoryboard,
  inspectVideoStoryboard,
  reviseVideoStoryboard,
  scriptToVideoStoryboard,
  waitForStoryboardJob,
} from "../../services/aiService";

vi.mock("../../services/aiService", () => ({
  draftVideoStoryboard: vi.fn(),
  inspectVideoStoryboard: vi.fn(),
  reviseVideoStoryboard: vi.fn(),
  scriptToVideoStoryboard: vi.fn(),
  waitForStoryboardJob: vi.fn(),
}));

vi.mock("../../services/storageService", () => ({ uploadFile: vi.fn() }));

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
  characterIds: [],
  references: [],
  startFrameUploadId: null,
});

const storyboard = {
  title: "晨光森林",
  global: { style: "寫實", lighting: "晨光", constraints: [], negative: "", characters: [] },
  shots: [shot("s1", "鏡頭穿過樹林"), shot("s2", "陽光灑落")],
};

const compiled = {
  sendMode: "multi",
  prompt: null,
  multiPrompt: [],
  negativePrompt: null,
  characterMode: "none",
  elements: [],
};

const segmentOf = (value) => [
  { index: 0, shotIds: ["s1", "s2"], durationSeconds: 6, mode: "t2v", chained: false, compiled: value },
];

const barista = {
  id: "c1",
  name: "咖啡師",
  description: "",
  uploadIds: ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"],
  imageLabel: null,
};

const agentResult = (overrides = {}) => ({
  storyboard,
  warnings: [{ shotId: "s2", code: "static_action", message: "固定鏡頭缺少動作" }],
  segments: segmentOf(compiled),
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

  it("exposes the job's progress while drafting and keeps its reasoning on the reply", async () => {
    let finish;
    draftVideoStoryboard.mockImplementationOnce(({ onProgress }) => new Promise((resolve) => {
      onProgress({ step: "writing", reasoning: "先決定開場", shots: [] });
      finish = () => {
        onProgress({ step: "checking", reasoning: "", shots: [] });
        resolve(agentResult());
      };
    }));
    const { result } = renderHook(() => useVideoStoryboard({ modelKey: "kling", hasStartFrame: false }));

    let drafting;
    act(() => {
      drafting = result.current.draft({ brief: "森林晨光", durationSeconds: 6 });
    });
    expect(result.current.progress).toMatchObject({ step: "writing", reasoning: "先決定開場" });

    await act(async () => {
      finish();
      await drafting;
    });
    expect(result.current.progress).toBeNull();
    expect(result.current.messages.at(-1)).toMatchObject({ kind: "storyboard", reasoning: "先決定開場" });
  });

  it("debounces inspection after an edit and keeps the edited storyboard", async () => {
    inspectVideoStoryboard.mockResolvedValue({ warnings: [], segments: segmentOf({ ...compiled, sendMode: "single" }) });
    const { result } = renderHook(() => useVideoStoryboard({ modelKey: "kling", hasStartFrame: false }));
    await act(() => result.current.draft({ brief: "森林晨光", durationSeconds: 6 }));

    act(() => result.current.edit((current) => ({ ...current, shots: current.shots.slice(0, 1) })));
    expect(result.current.inspection.status).toBe("loading");
    expect(inspectVideoStoryboard).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(400));

    expect(inspectVideoStoryboard).toHaveBeenCalledTimes(1);
    expect(result.current.board.storyboard.shots).toHaveLength(1);
    expect(result.current.board.warnings).toEqual([]);
    expect(result.current.board.segments[0].compiled.sendMode).toBe("single");
    expect(result.current.inspection.status).toBe("ready");
  });

  it("treats the result as stale and re-inspects when the model changes", async () => {
    inspectVideoStoryboard.mockResolvedValue({ warnings: [], segments: segmentOf(compiled) });
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

  it("keeps the board's characters when drafting again", async () => {
    const cast = {
      ...storyboard,
      global: { ...storyboard.global, characters: [barista] },
      shots: [{ ...storyboard.shots[0], characterIds: ["c1"] }, storyboard.shots[1]],
    };
    draftVideoStoryboard.mockResolvedValueOnce(agentResult({ storyboard: cast }));
    const { result } = renderHook(() => useVideoStoryboard({ modelKey: "kling", hasStartFrame: false }));

    await act(() => result.current.draft({ brief: "咖啡廣告", durationSeconds: 6 }));
    await act(() => result.current.draft({ brief: "換成夜景", durationSeconds: 6 }));

    expect(draftVideoStoryboard.mock.calls[0][0].characters).toEqual([]);
    expect(draftVideoStoryboard.mock.calls[1][0].characters).toEqual([barista]);
  });

  it("removing a character also clears it from every shot", async () => {
    const cast = {
      ...storyboard,
      global: { ...storyboard.global, characters: [barista] },
      shots: storyboard.shots.map((item) => ({ ...item, characterIds: ["c1"] })),
    };
    draftVideoStoryboard.mockResolvedValueOnce(agentResult({ storyboard: cast }));
    const { result } = renderHook(() => useVideoStoryboard({ modelKey: "kling", hasStartFrame: true }));
    await act(() => result.current.draft({ brief: "咖啡廣告", durationSeconds: 6 }));

    act(() => storyboardActions(result.current).removeCharacter("c1"));

    expect(result.current.board.storyboard.global.characters).toEqual([]);
    expect(result.current.board.storyboard.shots.map((item) => item.characterIds)).toEqual([[], []]);
  });

  it("uploads character images, remembers a preview, and rejects files over 10MB", async () => {
    vi.useRealTimers(); // FileReader never settles under fake timers.
    uploadFile.mockResolvedValue({ uploadId: "AAAAAAAA-1111-4111-8111-111111111111" });
    const { result } = renderHook(() => useVideoStoryboard({ modelKey: "kling", hasStartFrame: true }));
    const file = new File(["png"], "front.png", { type: "image/png" });

    let uploadId;
    await act(async () => {
      uploadId = await result.current.uploadImage(file);
    });

    expect(uploadId).toBe("aaaaaaaa-1111-4111-8111-111111111111");
    expect(result.current.previews[uploadId]).toMatch(/^data:image\/png/);

    const large = new File(["x"], "large.png", { type: "image/png" });
    Object.defineProperty(large, "size", { value: 10 * 1024 * 1024 + 1 });
    await expect(result.current.uploadImage(large)).rejects.toThrow("角色參考圖必須小於 10MB");
  });

  it("imports a script document by upload id and keeps its reference previews", async () => {
    const imageId = "33333333-3333-4333-8333-333333333333";
    const imported = {
      ...storyboard,
      shots: [{ ...storyboard.shots[0], references: [{ label: "Image1", uploadId: imageId }] }, storyboard.shots[1]],
    };
    uploadFile.mockResolvedValue({ uploadId: "doc-1" });
    scriptToVideoStoryboard.mockResolvedValue(
      agentResult({ storyboard: imported, referencePreviews: { [imageId]: "data:image/webp;base64,AA" } })
    );
    const { result } = renderHook(() => useVideoStoryboard({ modelKey: "kling", hasStartFrame: false }));
    const file = new File(["docx"], "腳本.docx");

    await act(() => result.current.importScript({ file }));

    expect(uploadFile).toHaveBeenCalledWith(file, "document");
    expect(scriptToVideoStoryboard).toHaveBeenCalledWith(
      expect.objectContaining({ modelKey: "kling", uploadId: "doc-1", hasStartFrame: false })
    );
    expect(scriptToVideoStoryboard.mock.calls[0][0]).not.toHaveProperty("script");
    expect(result.current.messages[0].text).toBe("匯入腳本文件：腳本.docx");
    expect(result.current.previews[imageId]).toBe("data:image/webp;base64,AA");
    expect(result.current.board.storyboard.shots[0].references).toEqual([{ label: "Image1", uploadId: imageId }]);
  });

  it("rejects unsupported script documents before uploading", async () => {
    const { result } = renderHook(() => useVideoStoryboard({ modelKey: "kling", hasStartFrame: false }));

    await act(() => result.current.importScript({ file: new File(["x"], "腳本.pdf") }));

    expect(uploadFile).not.toHaveBeenCalled();
    expect(result.current.messages.at(-1)).toMatchObject({ kind: "error", text: "腳本文件只支援 DOCX、TXT、MD" });
  });

  it("clears a start frame when its shot no longer starts a segment", async () => {
    const imageId = "33333333-3333-4333-8333-333333333333";
    const imported = {
      ...storyboard,
      shots: [storyboard.shots[0], { ...storyboard.shots[1], cut: true, references: [{ label: "Image1", uploadId: imageId }] }],
    };
    draftVideoStoryboard.mockResolvedValueOnce(agentResult({ storyboard: imported }));
    const { result } = renderHook(() => useVideoStoryboard({ modelKey: "kling", hasStartFrame: false }));
    await act(() => result.current.draft({ brief: "咖啡廣告", durationSeconds: 6 }));

    act(() => storyboardActions(result.current).setStartFrame("s2", imageId));
    expect(result.current.board.storyboard.shots[1].startFrameUploadId).toBe(imageId);

    act(() => storyboardActions(result.current).updateShot("s2", { cut: false }));
    expect(result.current.board.storyboard.shots[1]).toMatchObject({ cut: false, startFrameUploadId: null });
  });

  it("restores a saved conversation and waits again for its running agent job", async () => {
    waitForStoryboardJob.mockResolvedValue(agentResult());
    const initial = {
      messages: [{ id: "m1", createdAt: 1, role: "user", text: "森林晨光" }],
      board: null,
      pendingAgent: { jobId: "job-1", kind: "draft" },
    };
    const { result } = renderHook(() => useVideoStoryboard({ modelKey: "kling", hasStartFrame: false, initial }));

    expect(result.current.pending).toBe("draft");
    await act(async () => {});

    expect(waitForStoryboardJob).toHaveBeenCalledWith(expect.objectContaining({ jobId: "job-1" }));
    expect(result.current.pending).toBeNull();
    expect(result.current.board.storyboard).toEqual(storyboard);
    expect(result.current.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
  });});
