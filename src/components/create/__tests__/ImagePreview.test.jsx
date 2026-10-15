import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../share/ShareToLineButton", () => ({ default: () => null }));

import ImagePreview from "../ImagePreview";

afterEach(cleanup);

describe("ImagePreview generation state", () => {
  it("forwards the selected ratio, output size, and prompt summary", () => {
    const { container } = render(
      <ImagePreview
        isGenerating
        aspectRatio="9:16"
        promptSummary="直式產品發表視覺"
        generationStatus={{
          label: "AI 正在建立構圖",
          helperText: "正在建立視覺結構",
        }}
      />
    );

    expect(container.querySelector("[data-image-generation-placeholder]")).toHaveClass(
      "aspect-[9/16]"
    );
    expect(within(container).getByText("1024×1536")).toBeInTheDocument();
    expect(within(container).getByText("“直式產品發表視覺”")).toBeInTheDocument();
  });
});

const v1 = { id: "a", parentId: null, imageUrl: "v1.png", instruction: "城市" };
const v2 = { id: "b", parentId: "a", imageUrl: "v2.png", instruction: "改黃色" };
const v3 = { id: "c", parentId: "a", imageUrl: "v3.png", instruction: "夜景" };
const labels = { a: "v1", b: "v2", c: "v3" };
const versionProps = {
  versionRows: [{ fromId: null, items: [v1, v2] }, { fromId: "a", items: [v3] }],
  activeVersionId: "b",
  getVersionLabel: (version) => labels[version.id],
  getVersion: (id) => [v1, v2, v3].find((version) => version.id === id),
};

describe("ImagePreview refinement", () => {
  it("submits the instruction with Enter and clears it on success", async () => {
    const onRefine = vi.fn().mockResolvedValue(true);
    render(<ImagePreview generatedImage="v2.png" onRefine={onRefine} />);
    const input = screen.getByRole("textbox", { name: "描述要修改的地方" });
    fireEvent.change(input, { target: { value: "把衣服改成黃色" } });
    fireEvent.submit(input.closest("form"));
    expect(onRefine).toHaveBeenCalledWith("把衣服改成黃色");
    await waitFor(() => expect(input).toHaveValue(""));
  });

  it("keeps the instruction and shows the error inline when refinement fails", async () => {
    const onRefine = vi.fn().mockResolvedValue(false);
    const { rerender } = render(<ImagePreview generatedImage="v2.png" onRefine={onRefine} />);
    const input = screen.getByRole("textbox", { name: "描述要修改的地方" });
    fireEvent.change(input, { target: { value: "改色" } });
    fireEvent.click(screen.getByRole("button", { name: "修改這張" }));
    await waitFor(() => expect(onRefine).toHaveBeenCalled());
    rerender(<ImagePreview generatedImage="v2.png" onRefine={onRefine} refineError="模型忙碌" />);
    expect(screen.getByRole("alert")).toHaveTextContent("模型忙碌");
    expect(input).toHaveValue("改色");
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("dims the current image while refining instead of showing the generation screen", () => {
    const { container } = render(
      <ImagePreview
        generatedImage="v2.png"
        isGenerating
        isRefining
        onRefine={vi.fn()}
        generationStatus={{ label: "AI 正在精修細節" }}
      />
    );
    expect(container.querySelector("[data-image-generation-placeholder]")).toBeNull();
    expect(screen.getByAltText("AI 產生的圖片")).toHaveClass("opacity-40");
    expect(screen.getByRole("status")).toHaveTextContent("AI 正在精修細節");
    expect(screen.getByRole("button", { name: "修改中…" })).toBeDisabled();
  });

  it("does not submit an empty instruction", () => {
    const onRefine = vi.fn();
    render(<ImagePreview generatedImage="v2.png" onRefine={onRefine} />);
    expect(screen.getByRole("button", { name: "修改這張" })).toBeDisabled();
  });

  it("lists versions with branches and selects one", () => {
    const onSelectVersion = vi.fn();
    render(<ImagePreview generatedImage="v2.png" onSelectVersion={onSelectVersion} {...versionProps} />);
    expect(screen.getByRole("button", { name: "v2：改黃色" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByText("↳ 從 v1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "v1：原始" }));
    expect(onSelectVersion).toHaveBeenCalledWith("a");
  });

  it("expands from the shown image's position", () => {
    const onExpand = vi.fn();
    render(<ImagePreview generatedImage="v2.png" onExpand={onExpand} />);
    fireEvent.click(screen.getByRole("button", { name: "展開畫布比較版本" }));
    expect(onExpand).toHaveBeenCalledWith(expect.objectContaining({ width: expect.any(Number), left: expect.any(Number) }));
  });

  it("hides the version strip for a single version and labels compressed history previews", () => {
    render(
      <ImagePreview
        generatedImage="v1.png"
        isCompressedPreview
        {...versionProps}
        versionRows={[{ fromId: null, items: [v1] }]}
      />
    );
    expect(screen.queryByRole("button", { name: "v1：原始" })).toBeNull();
    expect(screen.getByText("此為壓縮預覽")).toBeInTheDocument();
  });
});
