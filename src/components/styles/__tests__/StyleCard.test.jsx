import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import StyleCard from "../StyleCard";

const style = {
  id: "style-1",
  name: "水彩手作感",
  description: "柔和的紙張與筆觸",
  previewUrl: "https://example.com/style.jpg",
  tags: ["插畫"],
  visibility: "private",
};

describe("StyleCard", () => {
  afterEach(() => cleanup());

  it("emits a preview action when a card image is clicked", () => {
    const onPreview = vi.fn();

    render(<StyleCard style={style} onApply={vi.fn()} onPreview={onPreview} />);

    fireEvent.click(screen.getByRole("button", { name: `放大查看風格圖片 ${style.name}` }));

    expect(onPreview).toHaveBeenCalledWith(style);
  });
});
