import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../services/aiService", () => ({
  analyzeDocument: vi.fn(),
}));

vi.mock("../../services/storageService", () => ({
  uploadFile: vi.fn(),
}));

import { analyzeDocument } from "../../services/aiService";
import { uploadFile } from "../../services/storageService";
import useDocumentAnalysis from "../useDocumentAnalysis";

const successfulAnalysis = {
  title: "季度報告",
  summary: "摘要",
  scenes: [{ scene_number: 1, scene_description: "第一幕" }],
};

const fileFixture = ({
  name = "quarterly-report.txt",
  type = "text/plain",
  bytes = new Uint8Array([65, 66, 67]),
  size = bytes.byteLength,
} = {}) => ({
  name,
  type,
  size,
  arrayBuffer: vi.fn(async () => bytes.buffer),
});

describe("useDocumentAnalysis", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    analyzeDocument.mockResolvedValue(successfulAnalysis);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uploads a document with document purpose and analyzes only its upload ID", async () => {
    const file = fileFixture();
    uploadFile.mockResolvedValue({
      uploadId: "123e4567-e89b-42d3-a456-426614174000",
      status: "ready",
    });
    const { result } = renderHook(() => useDocumentAnalysis());

    let pending;
    await act(async () => {
      pending = result.current.analyzeDocument(file, 4);
      await pending;
    });

    expect(uploadFile).toHaveBeenCalledWith(file, "document");
    expect(analyzeDocument).toHaveBeenCalledWith({
      uploadId: "123e4567-e89b-42d3-a456-426614174000",
      fileName: "quarterly-report.txt",
      contentType: "text/plain",
      sceneCount: 4,
    });
    expect(analyzeDocument.mock.calls[0][0]).not.toHaveProperty("documentUrl");
  });

  it("keeps the visible phases and shapes the successful result", async () => {
    let finishUpload;
    let finishAnalysis;
    uploadFile.mockImplementation(
      () => new Promise((resolve) => {
        finishUpload = resolve;
      })
    );
    analyzeDocument.mockImplementation(
      () => new Promise((resolve) => {
        finishAnalysis = resolve;
      })
    );
    const file = fileFixture();
    const { result } = renderHook(() => useDocumentAnalysis());

    let pending;
    act(() => {
      pending = result.current.analyzeDocument(file, "auto");
    });
    expect(result.current.isAnalyzing).toBe(true);
    expect(result.current.analysisPhase).toBe("上傳文件到雲端儲存空間...");

    await act(async () => {
      finishUpload({ uploadId: "123e4567-e89b-42d3-a456-426614174000" });
    });
    expect(result.current.analysisPhase).toBe("AI 正在分析文件內容（約需 15-30 秒）...");

    await act(async () => {
      finishAnalysis(successfulAnalysis);
      await pending;
    });

    expect(result.current.isAnalyzing).toBe(false);
    expect(result.current.analysisPhase).toBe("");
    expect(result.current.error).toBeNull();
    expect(result.current.documentResult).toEqual(
      expect.objectContaining({
        title: "季度報告",
        fileName: "quarterly-report.txt",
        fileSize: 3,
        analyzedAt: expect.any(String),
      })
    );
  });

  it("falls back to Base64 after a small upload failure", async () => {
    const file = fileFixture({ bytes: new Uint8Array([65, 66, 67]) });
    uploadFile.mockRejectedValue(new Error("temporary upload failure"));
    const { result } = renderHook(() => useDocumentAnalysis());

    await act(async () => {
      await result.current.analyzeDocument(file, 2);
    });

    expect(file.arrayBuffer).toHaveBeenCalledTimes(1);
    expect(analyzeDocument).toHaveBeenCalledWith({
      fileName: "quarterly-report.txt",
      contentType: "text/plain",
      sceneCount: 2,
      base64Content: "QUJD",
    });
    expect(analyzeDocument.mock.calls[0][0]).not.toHaveProperty("uploadId");
  });

  it("reports retry guidance instead of Base64 encoding an upload failure above 80 KiB", async () => {
    const file = fileFixture({ size: 80 * 1024 + 1 });
    uploadFile.mockRejectedValue(new Error("network unavailable"));
    const { result } = renderHook(() => useDocumentAnalysis());

    let thrown;
    await act(async () => {
      try {
        await result.current.analyzeDocument(file, 2);
      } catch (error) {
        thrown = error;
      }
    });

    expect(thrown).toEqual(
      new Error("檔案上傳失敗：network unavailable。請確認網路連線後重試。")
    );

    await waitFor(() => {
      expect(result.current.isAnalyzing).toBe(false);
      expect(result.current.error).toBe(
        "檔案上傳失敗：network unavailable。請確認網路連線後重試。"
      );
    });
    expect(file.arrayBuffer).not.toHaveBeenCalled();
    expect(analyzeDocument).not.toHaveBeenCalled();
  });
});
