import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import GenerationSignature from "../GenerationSignature";
import PixoraMark from "../PixoraMark";
import ProductGlyph from "../ProductGlyph";
import ThemeGlyph from "../ThemeGlyph";
import ViewModeGlyph from "../ViewModeGlyph";

describe("Pixora kinetic glyphs", () => {
  it("exposes an accessible title only when the glyph carries meaning", () => {
    const { container } = render(
      <>
        <PixoraMark title="Pixora" />
        <ProductGlyph kind="transform" active />
      </>
    );

    expect(screen.getByRole("img", { name: "Pixora" })).toBeInTheDocument();
    expect(container.querySelector('[data-product-glyph="transform"]')).toHaveAttribute(
      "aria-hidden",
      "true"
    );
  });

  it("renders finite state markers for theme, view mode, and generation", () => {
    const { container } = render(
      <>
        <ThemeGlyph isDark />
        <ViewModeGlyph mode="table" />
        <GenerationSignature state="working" />
      </>
    );

    expect(container.querySelector("[data-theme-glyph]")).toHaveAttribute(
      "data-theme-glyph",
      "dark"
    );
    expect(container.querySelector("[data-view-mode]")).toHaveAttribute(
      "data-view-mode",
      "table"
    );
    expect(container.querySelector("[data-generation-signature]")).toHaveAttribute(
      "data-generation-signature",
      "working"
    );
  });
});
