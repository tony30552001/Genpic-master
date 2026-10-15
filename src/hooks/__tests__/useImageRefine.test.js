import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  uploadFile: vi.fn(),
  imageUrlToFile: vi.fn(),
}));

vi.mock("../../services/storageService", () => ({ uploadFile: mocks.uploadFile }));
vi.mock("../../lib/imageFile", async (importOriginal) => ({
  ...(await importOriginal()),
  readImageSize: vi.fn(async () => ({ width: 1536, height: 1024 })),
  imageUrlToFile: mocks.imageUrlToFile,
}));

import useImageRefine from "../useImageRefine";
import useImageVersions from "../useImageVersions";

const settings = () => ({ imageQuality: "high", imageLanguage: "none" });

function setup() {
  let jobCount = 0;
  const transformImage = vi.fn(async () => {
    jobCount += 1;
    return { jobId: `job-r${jobCount}`, imageUrl: `refined-${jobCount}.png`, finalPrompt: "assembled" };
  });
  const saveHistoryItem = vi.fn().mockResolvedValue(undefined);
  const hook = renderHook(() => {
    const versions = useImageVersions();
    const refine = useImageRefine({ versions, transformImage, saveHistoryItem });
    return { versions, refine };
  });
  act(() => { hook.result.current.versions.startChain({ jobId: "job-1", imageUrl: "data:image/png;base64,v1" }); });
  return { ...hook, transformImage, saveHistoryItem };
}

describe("useImageRefine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.imageUrlToFile.mockResolvedValue(new File(["x"], "v1.png", { type: "image/png" }));
    mocks.uploadFile.mockResolvedValue({ uploadId: "upload-v1" });
  });

  it("refines the selected version, records history and adds a child version", async () => {
    const { result, transformImage, saveHistoryItem } = setup();
    const rootId = result.current.versions.activeVersionId;
    let ok;
    await act(async () => { ok = await result.current.refine.refine("  把衣服改成黃色 ", settings); });
    expect(ok).toBe(true);
    expect(transformImage).toHaveBeenCalledWith({
      uploadId: "upload-v1", mode: "refine", prompt: "把衣服改成黃色", aspectRatio: "3:2",
      imageQuality: "high", imageLanguage: "none", filenameSource: "把衣服改成黃色",
    });
    expect(saveHistoryItem).toHaveBeenCalledWith({
      jobId: "job-r1", imageUrl: "refined-1.png", userScript: "把衣服改成黃色", stylePrompt: "",
      fullPrompt: "assembled", styleId: null, source: "refine",
    });
    expect(result.current.versions.activeVersion).toMatchObject({
      jobId: "job-r1", imageUrl: "refined-1.png", instruction: "把衣服改成黃色", parentId: rootId,
    });
  });

  it("uploads each version only once, including when branching", async () => {
    const { result, transformImage } = setup();
    const rootId = result.current.versions.activeVersionId;
    await act(async () => { await result.current.refine.refine("第一次", settings); });
    act(() => { result.current.versions.selectVersion(rootId); });
    await act(async () => { await result.current.refine.refine("分支", settings); });
    expect(mocks.uploadFile).toHaveBeenCalledTimes(1);
    expect(transformImage).toHaveBeenCalledTimes(2);
    const branch = result.current.versions.activeVersion;
    expect(branch.parentId).toBe(rootId);
    expect(result.current.versions.rows).toHaveLength(2);
  });

  it("keeps the current version and reports the error inline when the job fails", async () => {
    const { result, transformImage } = setup();
    const rootId = result.current.versions.activeVersionId;
    transformImage.mockRejectedValueOnce(new Error("模型忙碌"));
    let ok;
    await act(async () => { ok = await result.current.refine.refine("改色", settings); });
    expect(ok).toBe(false);
    expect(result.current.refine.refineError).toBe("模型忙碌");
    expect(result.current.refine.isRefining).toBe(false);
    expect(result.current.versions.activeVersionId).toBe(rootId);
    expect(result.current.versions.versions).toHaveLength(1);
  });

  it("keeps the refined version when only the history write fails", async () => {
    const { result, saveHistoryItem } = setup();
    saveHistoryItem.mockRejectedValueOnce(new Error("db down"));
    await act(async () => { await result.current.refine.refine("改色", settings); });
    expect(result.current.versions.versions).toHaveLength(2);
    expect(result.current.refine.refineError).toContain("無法存入紀錄");
  });

  it("reports a model-setup error without starting a job", async () => {
    const { result, transformImage } = setup();
    await act(async () => {
      await result.current.refine.refine("改色", () => { throw new Error("尚未設定圖片模型"); });
    });
    expect(result.current.refine.refineError).toBe("尚未設定圖片模型");
    expect(transformImage).not.toHaveBeenCalled();
  });
});
