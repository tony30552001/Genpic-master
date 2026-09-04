import { render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ImagePreview from "../ImagePreview";

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
