import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ImageGeneratingState from "../ImageGeneratingState";

describe("ImageGeneratingState", () => {
  it("uses one Pixora signature while preserving live loading status", () => {
    const { container } = render(
      <ImageGeneratingState generationStatus={{ label: "正在配置版面" }} />
    );

    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(container.querySelectorAll("[data-generation-signature]")).toHaveLength(1);
    expect(container.querySelector(".image-preview-dot")).not.toBeInTheDocument();
    expect(screen.getByText("正在配置版面")).toHaveClass("sr-only");
  });

  it("keeps the compact signature decorative", () => {
    const { container } = render(<ImageGeneratingState compact />);

    expect(container.querySelector("[data-generation-signature]")).toHaveAttribute(
      "aria-hidden",
      "true"
    );
    expect(container).not.toHaveTextContent("Compose");
  });
});
