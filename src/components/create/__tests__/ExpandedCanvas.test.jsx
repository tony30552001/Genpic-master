import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ExpandedCanvas from "../ExpandedCanvas";

const root = { id: "a", imageUrl: "data:image/png;base64,AAA", instruction: "城市", parentId: null };
const child = { id: "b", imageUrl: "data:image/png;base64,BBB", instruction: "天空改成黃昏", parentId: "a" };
const labels = { a: "v1", b: "v2" };

const renderCanvas = (props = {}) => {
  const onClose = vi.fn();
  render(
    <ExpandedCanvas
      origin={{ x: 100, y: 100, scale: 0.5 }}
      version={child}
      parent={root}
      getVersionLabel={(version) => labels[version.id]}
      onClose={onClose}
      isRefining={false}
      refineError=""
      onRefine={vi.fn()}
      refineDisabled={false}
      versionRows={[{ fromId: null, items: [root, child] }]}
      activeVersionId="b"
      onSelectVersion={vi.fn()}
      getVersion={(id) => ({ a: root, b: child })[id]}
      {...props}
    />
  );
  return { onClose };
};

describe("ExpandedCanvas", () => {
  afterEach(() => {
    cleanup();
    window.history.replaceState(null, "");
  });

  it("shows the parent while the image or compare button is held", () => {
    renderCanvas();

    const image = screen.getByAltText("v2");
    fireEvent.pointerDown(image.parentElement, { pointerId: 1 });
    expect(screen.getByAltText("v1（原圖）")).toBeInTheDocument();
    fireEvent.pointerUp(image.parentElement, { pointerId: 1 });
    expect(screen.getByAltText("v2")).toBeInTheDocument();

    const button = screen.getByRole("button", { name: "按住比較（或按住空白鍵）" });
    fireEvent.pointerDown(button, { pointerId: 2 });
    expect(screen.getByAltText("v1（原圖）")).toBeInTheDocument();
    fireEvent.pointerUp(button, { pointerId: 2 });
    expect(screen.queryByAltText("v1（原圖）")).not.toBeInTheDocument();
  });

  it("holds the parent with the space key unless typing", () => {
    renderCanvas();

    fireEvent.keyDown(window, { key: " " });
    expect(screen.getByAltText("v1（原圖）")).toBeInTheDocument();
    fireEvent.keyUp(window, { key: " " });
    expect(screen.getByAltText("v2")).toBeInTheDocument();

    const input = screen.getByLabelText("描述要修改的地方");
    fireEvent.keyDown(input, { key: " " });
    expect(screen.queryByAltText("v1（原圖）")).not.toBeInTheDocument();
  });

  it("sweeps the slider to the middle once when entering slider mode, then follows the keyboard", async () => {
    renderCanvas();
    fireEvent.click(screen.getByRole("button", { name: "前後滑桿" }));

    const slider = screen.getByRole("slider", { name: "前後比較位置" });
    expect(slider).toHaveAttribute("aria-valuenow", "100");
    await waitFor(() => expect(slider).toHaveAttribute("aria-valuenow", "50"));
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(slider).toHaveAttribute("aria-valuenow", "55");
    fireEvent.keyDown(slider, { key: "Home" });
    expect(slider).toHaveAttribute("aria-valuenow", "0");
    fireEvent.keyDown(slider, { key: "ArrowLeft" });
    expect(slider).toHaveAttribute("aria-valuenow", "0");
    expect(screen.getByAltText("v1（原圖）")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "按住看原圖" }));
    fireEvent.click(screen.getByRole("button", { name: "前後滑桿" }));
    const again = screen.getByRole("slider", { name: "前後比較位置" });
    expect(again).toHaveAttribute("aria-valuenow", "100");
  });

  it("stops the slider sweep as soon as the user takes over", async () => {
    renderCanvas();
    fireEvent.click(screen.getByRole("button", { name: "前後滑桿" }));

    const slider = screen.getByRole("slider", { name: "前後比較位置" });
    fireEvent.keyDown(slider, { key: "End" });
    expect(slider).toHaveAttribute("aria-valuenow", "100");
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(slider).toHaveAttribute("aria-valuenow", "100");
  });

  it("closes through its history entry with Esc, the close button or back", async () => {
    const { onClose } = renderCanvas();
    expect(window.history.state?.pixoraLayerDepth).toBe(1);
    expect(screen.getByRole("button", { name: "關閉" })).toHaveFocus();

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    cleanup();

    const second = renderCanvas();
    fireEvent.click(screen.getByRole("button", { name: "關閉" }));
    await waitFor(() => expect(second.onClose).toHaveBeenCalledTimes(1));
    cleanup();

    const third = renderCanvas();
    act(() => window.history.back());
    await waitFor(() => expect(third.onClose).toHaveBeenCalledTimes(1));
  });

  it("shows a root version without compare controls", () => {
    renderCanvas({ version: root, parent: undefined, activeVersionId: "a" });

    expect(screen.getByAltText("v1")).toBeInTheDocument();
    expect(screen.getByText("原始生成")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "比較方式" })).not.toBeInTheDocument();
  });
});
