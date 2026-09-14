import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../services/aiService", () => ({
  analyzeStyle: vi.fn(),
  generateImage: vi.fn(),
  generateFilename: vi.fn(),
  waitForImageJob: vi.fn(),
}));

import { generateImage, generateFilename, waitForImageJob } from "../../services/aiService";
import useImageGeneration from "../useImageGeneration";

const admission = { jobId: "job-original", model: "custom-model", status: "queued", prompt: "server prompt" };
const completed = { ...admission, status: "succeeded", operation: "generate", imageUrl: "data:image/png;base64,result" };

describe("useImageGeneration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateImage.mockResolvedValue(admission);
    generateFilename.mockResolvedValue({ filename: "scene-title" });
    waitForImageJob.mockResolvedValue(completed);
  });

  it.each(["low", "medium", "high", "xhigh", "max", "auto"])("forwards %s and preserves completed job identity and filename", async (imageQuality) => {
    const { result } = renderHook(() => useImageGeneration());
    let generated;
    await act(async () => {
      generated = await result.current.generateImage({
        userScript: "scene", imageQuality, imageLanguage: "zh-TW", model: "ignored",
      });
    });
    expect(generateImage.mock.calls[0][0]).toMatchObject({ imageQuality, userScript: "scene", imageLanguage: "zh-TW" });
    expect(generateImage.mock.calls[0][0]).not.toHaveProperty("model");
    expect(waitForImageJob).toHaveBeenCalledWith({ jobId: "job-original", signal: expect.any(AbortSignal) });
    expect(generated).toMatchObject({
      jobId: "job-original", model: "custom-model", imageUrl: completed.imageUrl, finalPrompt: "server prompt",
    });
    expect(await generated.filenamePromise).toBe("scene-title");
    expect(result.current.generatedImage).toBe(completed.imageUrl);
    expect(result.current.isGenerating).toBe(false);
  });

  it("uses the same asynchronous path for a reference and leaves document previews independent", async () => {
    waitForImageJob.mockResolvedValueOnce({ ...completed, operation: "edit" });
    const { result } = renderHook(() => useImageGeneration());
    let generated;
    await act(async () => {
      generated = await result.current.generateImage({
        userScript: "reference scene", referenceUploadId: "upload-1", updatePreview: false,
      });
    });
    expect(generateImage.mock.calls[0][0].referenceUploadId).toBe("upload-1");
    expect(generated.jobId).toBe("job-original");
    expect(result.current.generatedImage).toBeNull();
  });

  it.each([
    { jobId: undefined }, { jobId: "another-job" }, { model: undefined }, { model: "different-model" },
    { imageUrl: undefined }, { status: "processing" }, { operation: "edit" },
  ])("rejects incomplete or mismatched completed jobs %j", async (override) => {
    waitForImageJob.mockResolvedValueOnce({ ...completed, ...override });
    const { result } = renderHook(() => useImageGeneration());
    await act(async () => {
      await expect(result.current.generateImage({ userScript: "scene" })).rejects.toThrow("圖片工作");
    });
    expect(result.current.generatedImage).toBeNull();
    expect(result.current.isGenerating).toBe(false);
  });

  it.each([
    { imageUrl: "direct", model: "custom-model" },
    { jobId: "job-1", status: "queued" },
    { jobId: "job-1", model: "custom-model", status: "succeeded", imageUrl: "direct" },
  ])("requires an async admission rather than a direct result %j", async (response) => {
    generateImage.mockResolvedValueOnce(response);
    const { result } = renderHook(() => useImageGeneration());
    await act(async () => {
      await expect(result.current.generateImage({ userScript: "scene" })).rejects.toThrow("圖片工作");
    });
    expect(waitForImageJob).not.toHaveBeenCalled();
    expect(result.current.generatedImage).toBeNull();
  });

  it("preserves cancel UX and passes the same abort signal to admission and polling", async () => {
    waitForImageJob.mockImplementationOnce(({ signal }) => new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(Object.assign(new Error("Aborted"), { name: "AbortError" })));
    }));
    const { result } = renderHook(() => useImageGeneration());
    let pending;
    await act(async () => {
      pending = result.current.generateImage({ userScript: "scene" });
      await Promise.resolve();
    });
    await act(async () => {
      const assertion = expect(pending).rejects.toMatchObject({ name: "AbortError", message: expect.stringContaining("已取消") });
      result.current.cancelGeneration();
      await assertion;
    });
    expect(generateImage.mock.calls[0][0].signal).toBe(waitForImageJob.mock.calls[0][0].signal);
    expect(result.current.isGenerating).toBe(false);
  });
});
