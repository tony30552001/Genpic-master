import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import VersionStrip from "../VersionStrip";

afterEach(cleanup);

const rowOf = (...items) => ({ fromId: null, items });
const version = (id, parentId = null, instruction = "") => ({ id, parentId, instruction, imageUrl: `${id}.png` });

describe("VersionStrip", () => {
  it("names independent roots as variants", () => {
    const rows = [rowOf(version("a")), rowOf(version("b"))];
    render(<VersionStrip rows={rows} activeVersionId="a" onSelectVersion={vi.fn()} />);
    expect(screen.getByRole("button", { name: "變體 1" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: "變體 2" })).toBeInTheDocument();
  });

  it("keeps the original label for a single chain", () => {
    const rows = [rowOf(version("a"), version("b", "a", "改黃色"))];
    render(<VersionStrip rows={rows} activeVersionId="b" onSelectVersion={vi.fn()} />);
    expect(screen.getByRole("button", { name: "原始" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "改黃色" })).toBeInTheDocument();
  });
});
