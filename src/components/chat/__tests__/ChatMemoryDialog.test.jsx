import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/services/imageChatService", () => ({
  getMemory: vi.fn(),
  saveMemory: vi.fn(),
}));

import * as chatApi from "@/services/imageChatService";
import ChatMemoryDialog from "../ChatMemoryDialog";

describe("ChatMemoryDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  it("loads the memory on open, saves the edited text and closes", async () => {
    const user = userEvent.setup();
    chatApi.getMemory.mockResolvedValue({ content: "- 不要人臉", updatedAt: null });
    chatApi.saveMemory.mockResolvedValue({ content: "- 不要人臉\n- 品牌色 #0F766E" });
    render(<ChatMemoryDialog />);

    await user.click(screen.getByRole("button", { name: "偏好記憶" }));
    const textarea = await screen.findByLabelText("偏好記憶內容");
    expect(textarea).toHaveValue("- 不要人臉");

    await user.type(textarea, "\n- 品牌色 #0F766E");
    await user.click(screen.getByRole("button", { name: "儲存" }));

    await waitFor(() =>
      expect(chatApi.saveMemory).toHaveBeenCalledWith({ content: "- 不要人臉\n- 品牌色 #0F766E" })
    );
    await waitFor(() => expect(screen.queryByLabelText("偏好記憶內容")).not.toBeInTheDocument());
  });

  it("shows a save error and keeps the dialog open", async () => {
    const user = userEvent.setup();
    chatApi.getMemory.mockResolvedValue({ content: "", updatedAt: null });
    chatApi.saveMemory.mockRejectedValue(new Error("偏好記憶已滿"));
    render(<ChatMemoryDialog />);

    await user.click(screen.getByRole("button", { name: "偏好記憶" }));
    await user.type(await screen.findByLabelText("偏好記憶內容"), "x");
    await user.click(screen.getByRole("button", { name: "儲存" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("偏好記憶已滿");
    expect(screen.getByLabelText("偏好記憶內容")).toBeInTheDocument();
  });
});
