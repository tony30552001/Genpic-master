import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../services/aiService", () => ({
  transformImage: vi.fn(),
  waitForImageJob: vi.fn(),
}));

vi.mock("../../services/storageService", () => ({
  uploadFile: vi.fn(),
}));

import { transformImage, waitForImageJob } from "../../services/aiService";
import { uploadFile } from "../../services/storageService";
import useImageTransform from "../useImageTransform";

const UPLOAD_ID = "123e4567-e89b-42d3-a456-426614174000";

describe("useImageTransform", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    uploadFile.mockResolvedValue({ uploadId: UPLOAD_ID, status: "ready" });
    transformImage.mockResolvedValue({
      imageUrl: "data:image/png;base64,result",
      prompt: "watercolor",
      model: "gemini-imagen",
    });
    waitForImageJob.mockResolvedValue({
      imageUrl: "data:image/png;base64,queued-result",
      model: "gpt-image-2",
      status: "succeeded",
    });
    vi.stubGlobal(
      "FileReader",
      class ImmediateFileReader {
        readAsDataURL() {
          this.result = "data:image/png;base64,source";
          queueMicrotask(() => this.onloadend?.());
        }
      }
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("uploads the source image and transforms by owner-scoped upload ID", async () => {
    const file = {
      name: "source.png",
      type: "image/png",
      size: 3,
    };
    const { result } = renderHook(() => useImageTransform());

    await act(async () => {
      await result.current.handleSourceImageUpload(file);
      await Promise.resolve();
    });
    expect(result.current.sourcePreview).toBe("data:image/png;base64,source");
    act(() => vi.runOnlyPendingTimers());

    await act(async () => {
      await result.current.runTransform({ imageLanguage: "zh-TW" });
    });

    expect(uploadFile).toHaveBeenCalledWith(file, "image");
    expect(transformImage).toHaveBeenCalledWith(
      expect.objectContaining({
        uploadId: UPLOAD_ID,
        mode: "style_transfer",
        imageLanguage: "zh-TW",
      })
    );
    expect(transformImage.mock.calls[0][0]).not.toHaveProperty("imageUrl");
    expect(transformImage.mock.calls[0][0]).not.toHaveProperty("imageBase64");
  });

  it("polls a queued GPT image edit until the result is ready", async () => {
    transformImage.mockResolvedValueOnce({
      jobId: "image-job-1",
      status: "queued",
      prompt: "watercolor",
      model: "gpt-image-2",
    });
    const file = {
      name: "source.png",
      type: "image/png",
      size: 3,
    };
    const { result } = renderHook(() => useImageTransform());

    await act(async () => {
      await result.current.handleSourceImageUpload(file);
      await Promise.resolve();
    });
    act(() => vi.runOnlyPendingTimers());

    let transformed;
    await act(async () => {
      transformed = await result.current.runTransform();
    });

    expect(waitForImageJob).toHaveBeenCalledWith({
      jobId: "image-job-1",
      signal: expect.any(AbortSignal),
    });
    expect(result.current.result).toBe("data:image/png;base64,queued-result");
    expect(transformed).toMatchObject({
      imageUrl: "data:image/png;base64,queued-result",
      mergedPrompt: "watercolor",
      model: "gpt-image-2",
    });
  });
});
