import { render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ImageGeneratingState from "../ImageGeneratingState";

describe("ImageGeneratingState", () => {
  it("keeps the final image frame while showing an accessible loading surface", () => {
    const { container } = render(
      <ImageGeneratingState
        generationStatus={{
          label: "正在配置版面",
          helperText: "正在建立視覺結構",
        }}
        promptSummary="以清楚的資訊層級介紹產品特色"
        resolutionLabel="1536×1024"
      />
    );

    expect(container.querySelector('[role="status"]')).toHaveAttribute(
      "aria-busy",
      "true"
    );
    expect(container.querySelector("[data-image-generation-placeholder]")).toBeInTheDocument();
    expect(container.querySelector("[data-generation-dots]")).toBeInTheDocument();
    expect(container.querySelectorAll("[data-generation-glow]")).toHaveLength(2);
    expect(within(container).getByText("1536×1024")).toBeInTheDocument();
    expect(container.querySelector("[data-generation-signature]")).not.toBeInTheDocument();
    expect(within(container).getByText("正在配置版面")).not.toHaveClass("sr-only");
    expect(
      within(container).getByText("“以清楚的資訊層級介紹產品特色”")
    ).toBeInTheDocument();
  });

  it("uses compact canvas metadata inside scene previews", () => {
    const { container } = render(<ImageGeneratingState compact />);

    expect(container.querySelector("[data-generation-dots]")).toBeInTheDocument();
    expect(container.querySelector("[data-generation-spinner]")).not.toBeInTheDocument();
    expect(within(container).getByText("正在生成圖片")).toBeInTheDocument();
    expect(container).not.toHaveTextContent("完成後會自動顯示在這裡");
    expect(container).not.toHaveTextContent("Compose");
  });
});
