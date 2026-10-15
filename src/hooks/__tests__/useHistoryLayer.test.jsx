import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useHistoryLayer } from "../useHistoryLayer";

afterEach(cleanup);

function Layer({ name, onClose }) {
  const ref = React.useRef(null);
  const close = useHistoryLayer(onClose, ref);
  return <button ref={ref} type="button" onClick={close}>{`關閉${name}`}</button>;
}

function Stack({ onCloseOuter, onCloseInner, showInner }) {
  return (
    <>
      <Layer name="外層" onClose={onCloseOuter} />
      {showInner && <Layer name="內層" onClose={onCloseInner} />}
    </>
  );
}

const depth = () => window.history.state?.pixoraLayerDepth || 0;

describe("useHistoryLayer", () => {
  it("stacks layers and lets Esc close only the topmost one", async () => {
    const base = depth();
    const onCloseOuter = vi.fn();
    const onCloseInner = vi.fn();
    const { rerender } = render(<Stack onCloseOuter={onCloseOuter} onCloseInner={onCloseInner} />);
    rerender(<Stack onCloseOuter={onCloseOuter} onCloseInner={onCloseInner} showInner />);
    expect(depth()).toBe(base + 2);
    expect(screen.getByRole("button", { name: "關閉內層" })).toHaveFocus();

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(onCloseInner).toHaveBeenCalledTimes(1));
    expect(onCloseOuter).not.toHaveBeenCalled();
    expect(depth()).toBe(base + 1);

    rerender(<Stack onCloseOuter={onCloseOuter} onCloseInner={onCloseInner} />);
    fireEvent.click(screen.getByRole("button", { name: "關閉外層" }));
    await waitFor(() => expect(onCloseOuter).toHaveBeenCalledTimes(1));
    expect(depth()).toBe(base);
  });

  it("closes on the system back gesture and restores focus to the opener", async () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const onClose = vi.fn();
    const { unmount } = render(<Layer name="結果" onClose={onClose} />);
    expect(screen.getByRole("button", { name: "關閉結果" })).toHaveFocus();

    act(() => window.history.back());
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });
});
