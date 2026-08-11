import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import StyleCard from "../StyleCard";
import StyleImageLightbox from "../StyleImageLightbox";

const style = {
  id: "style-1",
  name: "水彩手作感",
  description: "柔和的紙張與筆觸",
  previewUrl: "https://example.com/style.jpg",
  tags: ["插畫"],
  visibility: "private",
};

describe("StyleImageLightbox", () => {
  it("closes with Escape", () => {
    const onClose = vi.fn();

    render(
      <StyleImageLightbox
        src={style.previewUrl}
        alt={style.name}
        onClose={onClose}
      />
    );

    expect(screen.getByRole("dialog", { name: `放大查看${style.name}` })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("emits a preview action when a card image is clicked", () => {
    const onPreview = vi.fn();

    render(
      <StyleCard
        style={style}
        onApply={vi.fn()}
        onPreview={onPreview}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: `放大查看風格圖片 ${style.name}` }));

    expect(onPreview).toHaveBeenCalledWith(style);
  });
});
