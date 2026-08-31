import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import AssetViewModeToggle from "../AssetViewModeToggle";
import { normalizeViewMode } from "../viewMode";

describe("AssetViewModeToggle", () => {
  it("marks the current mode and changes mode on selection", () => {
    const onChange = vi.fn();

    const { container, rerender } = render(
      <AssetViewModeToggle value="grid" onChange={onChange} />
    );

    expect(screen.getByRole("button", { name: "Grid模式" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "條列模式" })).toHaveAttribute("aria-pressed", "false");
    expect(container.querySelector("[data-view-mode]")).toHaveAttribute("data-view-mode", "grid");

    fireEvent.click(screen.getByRole("button", { name: "表格模式" }));

    expect(onChange).toHaveBeenCalledWith("table");

    rerender(<AssetViewModeToggle value="table" onChange={onChange} />);
    expect(container.querySelector("[data-view-mode]")).toHaveAttribute("data-view-mode", "table");
  });

  it("falls back to table for an absent or invalid view", () => {
    expect(normalizeViewMode()).toBe("table");
    expect(normalizeViewMode("kanban")).toBe("table");
  });
});
