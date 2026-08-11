import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import AssetViewModeToggle from "../AssetViewModeToggle";

describe("AssetViewModeToggle", () => {
  it("marks the current mode and changes mode on selection", () => {
    const onChange = vi.fn();

    render(<AssetViewModeToggle value="grid" onChange={onChange} />);

    expect(screen.getByRole("button", { name: "Grid模式" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "條列模式" })).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(screen.getByRole("button", { name: "表格模式" }));

    expect(onChange).toHaveBeenCalledWith("table");
  });
});
