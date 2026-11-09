import React from "react";
import { cleanup, createEvent, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ImageInputs from "../ImageInputs";

const attachment = {
  uploadId: "upload-1",
  previewUrl: "data:image/png;base64,a",
  name: "photo.png",
  origin: "upload",
  aspectRatio: "4:3",
};

function renderInputs(props = {}) {
  const handlers = {
    onPurposeChange: vi.fn(),
    onAttachFile: vi.fn(),
    onAttachCurrentResult: vi.fn(),
    onClearAttachment: vi.fn(),
    onStyleReferenceUpload: vi.fn(),
    onStyleReferenceCurrentResult: vi.fn(),
    onClearStyleReference: vi.fn(),
  };
  render(
    <ImageInputs
      attachment={null}
      isUploadingAttachment={false}
      purposeId="reference"
      styleReferencePreview={null}
      isUploadingStyleReference={false}
      canUseCurrentResult={false}
      styleAnalysis={<p>分析區</p>}
      {...handlers}
      {...props}
    />
  );
  return handlers;
}

const imageFile = () => new File(["x"], "photo.png", { type: "image/png" });

describe("ImageInputs", () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it("shows both slots and only enables the current result when one exists", () => {
    renderInputs();
    expect(screen.getByRole("button", { name: /上傳內容圖/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /上傳風格圖/ })).toBeEnabled();
    for (const button of screen.getAllByRole("button", { name: "用目前結果" })) {
      expect(button).toBeDisabled();
    }
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(screen.queryByText("分析區")).not.toBeInTheDocument();
  });

  it("routes chosen files to the matching slot", () => {
    const { onAttachFile, onStyleReferenceUpload } = renderInputs();
    const file = imageFile();
    fireEvent.change(screen.getByLabelText("選擇內容圖檔案"), { target: { files: [file] } });
    expect(onAttachFile).toHaveBeenCalledWith(file);
    expect(onStyleReferenceUpload).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("選擇風格圖檔案"), { target: { files: [file] } });
    expect(onStyleReferenceUpload).toHaveBeenCalledWith(file);
  });

  it("accepts dropped images in either slot and ignores other files", () => {
    const { onAttachFile, onStyleReferenceUpload } = renderInputs();
    const file = imageFile();
    const dropZone = screen.getByRole("button", { name: /上傳風格圖/ }).parentElement;
    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });
    expect(onStyleReferenceUpload).toHaveBeenCalledWith(file);
    fireEvent.drop(dropZone, {
      dataTransfer: { files: [new File(["x"], "a.txt", { type: "text/plain" })] },
    });
    expect(onStyleReferenceUpload).toHaveBeenCalledTimes(1);
    expect(onAttachFile).not.toHaveBeenCalled();
  });

  it("accepts pasted images in the focused slot", () => {
    const { onAttachFile, onStyleReferenceUpload } = renderInputs();
    const file = imageFile();
    const event = createEvent.paste(screen.getByRole("button", { name: /上傳風格圖/ }), {
      clipboardData: {
        getData: () => "",
        items: [{ kind: "file", type: "image/png", getAsFile: () => file }],
      },
    });
    fireEvent(screen.getByRole("button", { name: /上傳風格圖/ }), event);
    expect(onStyleReferenceUpload).toHaveBeenCalledWith(file);
    expect(onAttachFile).not.toHaveBeenCalled();
  });

  it("uses the current result for each slot independently", () => {
    const { onAttachCurrentResult, onStyleReferenceCurrentResult } = renderInputs({ canUseCurrentResult: true });
    const [contentButton, styleButton] = screen.getAllByRole("button", { name: "用目前結果" });
    fireEvent.click(contentButton);
    expect(onAttachCurrentResult).toHaveBeenCalledTimes(1);
    fireEvent.click(styleButton);
    expect(onStyleReferenceCurrentResult).toHaveBeenCalledTimes(1);
  });

  it("lists the content purposes and reports the selection", () => {
    const { onPurposeChange, onClearAttachment } = renderInputs({ attachment, purposeId: "refine" });
    expect(screen.getByRole("radiogroup", { name: "內容圖要怎麼用" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "修改這張" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: "換背景" }));
    expect(onPurposeChange).toHaveBeenCalledWith("bg_replace");
    fireEvent.click(screen.getByRole("button", { name: "移除內容圖" }));
    expect(onClearAttachment).toHaveBeenCalled();
  });

  it("shows the style preview with its analysis and lets it be removed", () => {
    const { onClearStyleReference } = renderInputs({ styleReferencePreview: "data:image/png;base64,b" });
    expect(screen.getByAltText("風格圖預覽")).toBeInTheDocument();
    expect(screen.getByText("分析區")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "移除風格圖與分析結果" }));
    expect(onClearStyleReference).toHaveBeenCalled();
  });

  it("shows the merged-transform notice only the first time", () => {
    renderInputs({ attachment });
    expect(screen.getByText(/圖片轉換已整合到這裡/)).toBeInTheDocument();
    cleanup();
    renderInputs({ attachment });
    expect(screen.queryByText(/圖片轉換已整合到這裡/)).not.toBeInTheDocument();
  });
});
