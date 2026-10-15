import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  uploadFile: vi.fn(),
  imageUrlToFile: vi.fn(),
}));

vi.mock("../../services/storageService", () => ({ uploadFile: mocks.uploadFile }));
vi.mock("../../lib/imageFile", async (importOriginal) => ({
  ...(await importOriginal()),
  readFileAsDataUrl: vi.fn(async () => "data:image/png;base64,preview"),
  readImageSize: vi.fn(async () => ({ width: 900, height: 1600 })),
  imageUrlToFile: mocks.imageUrlToFile,
}));

import useCreateWorkspace from "../useCreateWorkspace";

const job = { jobId: "job-1", imageUrl: "https://blob/result.png", finalPrompt: "assembled" };
const file = (size = 10) => new File(["x".repeat(size)], "photo.png", { type: "image/png" });

function setup() {
  const generateImage = vi.fn().mockResolvedValue(job);
  const transformImage = vi.fn().mockResolvedValue(job);
  const saveHistoryItem = vi.fn().mockResolvedValue(undefined);
  const onImageCreated = vi.fn();
  const hook = renderHook(() => useCreateWorkspace({ generateImage, transformImage, saveHistoryItem, onImageCreated }));
  return { ...hook, generateImage, transformImage, saveHistoryItem, onImageCreated };
}

const submitInput = {
  prompt: "Optimized prompt",
  userScript: "使用者描述",
  stylePrompt: "watercolor",
  styleTags: ["柔和"],
  styleId: "style-1",
  imagePurpose: "infographic",
  aspectRatio: "16:9",
  imageQuality: "high",
  imageLanguage: "none",
};

describe("useCreateWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.uploadFile.mockResolvedValue({ uploadId: "upload-1" });
  });

  it("generates without an attachment and records a general history item", async () => {
    const { result, generateImage, transformImage, saveHistoryItem } = setup();
    let output;
    await act(async () => { output = await result.current.submit(submitInput); });
    expect(generateImage).toHaveBeenCalledWith(expect.objectContaining({
      userScript: "Optimized prompt", analyzedStyle: "watercolor", styleTags: ["柔和"],
      purpose: "infographic", aspectRatio: "16:9", referenceUploadId: null,
    }));
    expect(transformImage).not.toHaveBeenCalled();
    expect(saveHistoryItem).toHaveBeenCalledWith({
      jobId: "job-1", imageUrl: job.imageUrl, userScript: "使用者描述",
      stylePrompt: "watercolor，柔和", fullPrompt: "assembled", styleId: "style-1", source: "general",
    });
    expect(output.styleId).toBe("style-1");
  });

  it("shows the finished image even when the history write fails", async () => {
    const { result, saveHistoryItem, onImageCreated } = setup();
    saveHistoryItem.mockRejectedValueOnce(new Error("db down"));
    await act(async () => {
      await expect(result.current.submit(submitInput)).rejects.toThrow("db down");
    });
    expect(onImageCreated).toHaveBeenCalledWith({ jobId: "job-1", imageUrl: job.imageUrl, instruction: "使用者描述" });
  });

  it("uses an attachment as content reference by default", async () => {
    const { result, generateImage } = setup();
    await act(async () => { await result.current.attachFile(file()); });
    expect(result.current.attachment).toMatchObject({
      uploadId: "upload-1", previewUrl: "data:image/png;base64,preview", origin: "upload", aspectRatio: "9:16",
    });
    expect(result.current.aspectRatioLocked).toBe(false);
    await act(async () => { await result.current.submit(submitInput); });
    expect(generateImage).toHaveBeenCalledWith(expect.objectContaining({ referenceUploadId: "upload-1" }));
  });

  it("refines the attachment without style, at its own aspect ratio", async () => {
    const { result, transformImage, saveHistoryItem } = setup();
    await act(async () => { await result.current.attachFile(file()); });
    act(() => { result.current.setPurpose("refine"); });
    expect(result.current.isTransform).toBe(true);
    expect(result.current.aspectRatioLocked).toBe(true);
    let output;
    await act(async () => { output = await result.current.submit(submitInput); });
    expect(transformImage).toHaveBeenCalledWith(expect.objectContaining({
      uploadId: "upload-1", mode: "refine", prompt: "Optimized prompt", stylePrompt: "", styleTags: [],
      aspectRatio: "9:16", imageQuality: "high", imageLanguage: "none",
    }));
    expect(saveHistoryItem).toHaveBeenCalledWith(expect.objectContaining({ source: "refine", stylePrompt: "", styleId: null }));
    expect(output.styleId).toBeNull();
  });

  it.each(["bg_replace", "element_extract", "style_transfer"])("keeps the style for %s", async (purpose) => {
    const { result, transformImage, saveHistoryItem } = setup();
    await act(async () => { await result.current.attachFile(file()); });
    act(() => { result.current.setPurpose(purpose); });
    await act(async () => { await result.current.submit(submitInput); });
    expect(transformImage).toHaveBeenCalledWith(expect.objectContaining({ mode: purpose, stylePrompt: "watercolor" }));
    expect(saveHistoryItem).toHaveBeenCalledWith(expect.objectContaining({ source: purpose, styleId: "style-1" }));
  });

  it("only requires a prompt for purposes that need one", async () => {
    const { result } = setup();
    expect(result.current.canSubmit("  ")).toBe(false);
    await act(async () => { await result.current.attachFile(file()); });
    act(() => { result.current.setPurpose("bg_replace"); });
    expect(result.current.canSubmit("")).toBe(true);
    act(() => { result.current.setPurpose("refine"); });
    expect(result.current.canSubmit("")).toBe(false);
  });

  it("resets the purpose when the attachment is removed", async () => {
    const { result } = setup();
    await act(async () => { await result.current.attachFile(file()); });
    act(() => { result.current.setPurpose("refine"); });
    act(() => { result.current.clearAttachment(); });
    expect(result.current.attachment).toBeNull();
    expect(result.current.purpose.id).toBe("reference");
    expect(result.current.isTransform).toBe(false);
  });

  it("rejects oversized files before uploading", async () => {
    const { result } = setup();
    const large = file();
    Object.defineProperty(large, "size", { value: 11 * 1024 * 1024 });
    await expect(result.current.attachFile(large)).rejects.toThrow("圖片過大");
    expect(mocks.uploadFile).not.toHaveBeenCalled();
  });

  it("attaches the current result by uploading it", async () => {
    mocks.imageUrlToFile.mockResolvedValue(file());
    const { result } = setup();
    await act(async () => { await result.current.attachImageUrl("https://blob/result.png"); });
    expect(mocks.imageUrlToFile).toHaveBeenCalledWith("https://blob/result.png", expect.stringContaining("pixora-result-"));
    expect(result.current.attachment).toMatchObject({ uploadId: "upload-1", origin: "result" });
    expect(result.current.isUploadingAttachment).toBe(false);
  });

  it("surfaces a failed result download", async () => {
    mocks.imageUrlToFile.mockRejectedValue(new Error("無法下載圖片 (403)"));
    const { result } = setup();
    let error;
    await act(async () => {
      error = await result.current.attachImageUrl("https://blob/result.png").catch((err) => err);
    });
    expect(error.message).toBe("無法下載圖片 (403)");
    expect(result.current.attachment).toBeNull();
    expect(result.current.isUploadingAttachment).toBe(false);
  });
});
