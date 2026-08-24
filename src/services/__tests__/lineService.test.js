import { describe, expect, it, vi } from "vitest";

vi.mock("../apiClient", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(() => Promise.resolve({ track: "bot", success: true })),
  apiDelete: vi.fn(),
}));

import { apiPost } from "../apiClient";
import { sendImageToLine } from "../lineService";

describe("lineService", () => {
  it("posts an owner-scoped upload ID and optional message, never a read URL", async () => {
    await sendImageToLine({
      uploadId: "123e4567-e89b-42d3-a456-426614174000",
      message: "請查看圖片",
    });

    expect(apiPost).toHaveBeenCalledWith("/api/send-line-image", {
      uploadId: "123e4567-e89b-42d3-a456-426614174000",
      message: "請查看圖片",
    });
    expect(apiPost.mock.calls[0][1]).not.toHaveProperty("imageUrl");
    expect(apiPost.mock.calls[0][1]).not.toHaveProperty("readUrl");
  });
});
