import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ImageLightbox from "../ImageLightbox";

const src = "https://example.com/style.jpg";
const alt = "水彩手作感";

describe("ImageLightbox", () => {
  afterEach(() => cleanup());

  it("closes with Escape", () => {
    const onClose = vi.fn();

    render(<ImageLightbox src={src} alt={alt} onClose={onClose} />);

    expect(screen.getByRole("dialog", { name: `放大查看${alt}` })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("renders no details, navigation or download by default", () => {
    render(<ImageLightbox src={src} alt={alt} onClose={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "上一張圖片" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "下一張圖片" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "下載原圖" })).not.toBeInTheDocument();
  });

  it("renders details, download link and position indicator", () => {
    render(
      <ImageLightbox
        src={src}
        alt={alt}
        onClose={vi.fn()}
        details={[
          { label: "模型", value: "Gemini" },
          { label: "風格", value: "" },
        ]}
        downloadUrl={src}
        downloadName="pixora-1.png"
        position={{ index: 1, total: 3 }}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />
    );

    expect(screen.getByText("模型")).toBeInTheDocument();
    expect(screen.getByText("Gemini")).toBeInTheDocument();
    expect(screen.queryByText("風格")).not.toBeInTheDocument();
    expect(screen.getByText("第 2 / 3 張")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "下載原圖" })).toHaveAttribute("href", src);
  });

  it("navigates with arrow keys and buttons", () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();

    render(
      <ImageLightbox src={src} alt={alt} onClose={vi.fn()} onPrev={onPrev} onNext={onNext} />
    );

    fireEvent.keyDown(document, { key: "ArrowLeft" });
    fireEvent.keyDown(document, { key: "ArrowRight" });
    fireEvent.click(screen.getByRole("button", { name: "下一張圖片" }));

    expect(onPrev).toHaveBeenCalledOnce();
    expect(onNext).toHaveBeenCalledTimes(2);
  });

  it("disables the missing navigation direction", () => {
    render(<ImageLightbox src={src} alt={alt} onClose={vi.fn()} onNext={vi.fn()} />);

    expect(screen.getByRole("button", { name: "上一張圖片" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "下一張圖片" })).toBeEnabled();
  });
});
