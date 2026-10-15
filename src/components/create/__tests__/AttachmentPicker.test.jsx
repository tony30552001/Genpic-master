import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AttachmentPicker from "../AttachmentPicker";

const attachment = {
  uploadId: "upload-1",
  previewUrl: "data:image/png;base64,a",
  name: "photo.png",
  origin: "upload",
  aspectRatio: "4:3",
};

function renderPicker(props = {}) {
  const handlers = {
    onPurposeChange: vi.fn(),
    onAttachFile: vi.fn(),
    onAttachCurrentResult: vi.fn(),
    onClear: vi.fn(),
  };
  render(
    <AttachmentPicker
      attachment={null}
      isUploading={false}
      purposeId="reference"
      canAttachCurrentResult={false}
      {...handlers}
      {...props}
    />
  );
  return handlers;
}

describe("AttachmentPicker", () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it("offers uploading and only enables the current result when one exists", () => {
    renderPicker();
    expect(screen.getByRole("button", { name: "上傳圖片" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "用目前結果" })).toBeDisabled();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });

  it("passes chosen image files to the workspace", () => {
    const { onAttachFile } = renderPicker();
    const file = new File(["x"], "photo.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("選擇附圖檔案"), { target: { files: [file] } });
    expect(onAttachFile).toHaveBeenCalledWith(file);
  });

  it("lists the attachment purposes and reports the selection", () => {
    const { onPurposeChange, onClear } = renderPicker({ attachment, purposeId: "refine" });
    const group = screen.getByRole("radiogroup", { name: "這張圖要怎麼用" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "修改這張" })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByRole("radio", { name: "套用風格到附圖" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "換背景" }));
    expect(onPurposeChange).toHaveBeenCalledWith("bg_replace");
    fireEvent.click(screen.getByRole("button", { name: "移除附圖" }));
    expect(onClear).toHaveBeenCalled();
  });

  it("shows the merged-transform notice only the first time", () => {
    renderPicker({ attachment });
    expect(screen.getByText(/圖片轉換已整合到這裡/)).toBeInTheDocument();
    cleanup();
    renderPicker({ attachment });
    expect(screen.queryByText(/圖片轉換已整合到這裡/)).not.toBeInTheDocument();
  });
});
