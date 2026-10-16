import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../hooks/useLineConfig", () => ({
  default: vi.fn(),
}));

vi.mock("../../../services/lineService", () => ({
  sendImageToLine: vi.fn(),
}));

vi.mock("../../../services/storageService", () => ({
  uploadFile: vi.fn(),
}));

vi.mock("../../../services/apiClient", () => ({
  apiGetBlob: vi.fn(),
}));

import useLineConfig from "../../../hooks/useLineConfig";
import { sendImageToLine } from "../../../services/lineService";
import { uploadFile } from "../../../services/storageService";
import { apiGetBlob } from "../../../services/apiClient";
import { API_BASE_URL } from "../../../config";
import ShareToLineButton from "../ShareToLineButton";

const DATA_URL = "data:image/png;base64,AAAA";

describe("ShareToLineButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useLineConfig.mockReturnValue({ isBound: true });
    uploadFile.mockResolvedValue({ uploadId: "123e4567-e89b-42d3-a456-426614174000" });
    sendImageToLine.mockResolvedValue({ success: false });
  });

  it("uploads a data URL as an image and sends only its upload ID", async () => {
    const { getByRole } = render(
      <ShareToLineButton imageUrl={DATA_URL} message="看這張" user={{}} />
    );

    fireEvent.click(getByRole("button", { name: "分享到 LINE" }));

    await waitFor(() => expect(sendImageToLine).toHaveBeenCalled());
    expect(uploadFile).toHaveBeenCalledWith(expect.any(File), "image");
    expect(sendImageToLine).toHaveBeenCalledWith({
      uploadId: "123e4567-e89b-42d3-a456-426614174000",
      message: "看這張",
    });
    expect(sendImageToLine.mock.calls[0][0]).not.toHaveProperty("imageUrl");
    expect(sendImageToLine.mock.calls[0][0]).not.toHaveProperty("readUrl");
  });

  it("reads an owned image-job asset before uploading it", async () => {
    apiGetBlob.mockResolvedValue(new Blob(["png"], { type: "image/png" }));
    const assetUrl = `${API_BASE_URL}/image-jobs/123e4567-e89b-42d3-a456-426614174001/image`;
    const { getByRole } = render(<ShareToLineButton imageUrl={assetUrl} user={{}} />);

    fireEvent.click(getByRole("button", { name: "分享到 LINE" }));

    await waitFor(() => expect(sendImageToLine).toHaveBeenCalled());
    expect(apiGetBlob).toHaveBeenCalledWith(assetUrl);
    expect(uploadFile).toHaveBeenCalledWith(expect.any(File), "image");
  });

  it("does not send an arbitrary remote image URL to the first-party endpoint", async () => {
    const { getByRole } = render(
      <ShareToLineButton imageUrl="https://attacker.example/image.png" user={{}} />
    );

    fireEvent.click(getByRole("button", { name: "分享到 LINE" }));

    await waitFor(() => expect(sendImageToLine).not.toHaveBeenCalled());
    expect(uploadFile).not.toHaveBeenCalled();
  });
});
