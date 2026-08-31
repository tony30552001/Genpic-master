import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import ThemeToggle from "../ThemeToggle";

describe("ThemeToggle", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove("dark");
    document.documentElement.style.colorScheme = "";
  });

  it("keeps the accessible label and kinetic glyph in sync with the theme", async () => {
    const user = userEvent.setup();
    const { container } = render(<ThemeToggle />);

    const button = screen.getByRole("button", { name: "切換至深色模式" });
    expect(container.querySelector("[data-theme-glyph]")).toHaveAttribute(
      "data-theme-glyph",
      "light"
    );

    await user.click(button);

    expect(document.documentElement).toHaveClass("dark");
    expect(screen.getByRole("button", { name: "切換至淺色模式" })).toBeInTheDocument();
    expect(container.querySelector("[data-theme-glyph]")).toHaveAttribute(
      "data-theme-glyph",
      "dark"
    );
  });
});
