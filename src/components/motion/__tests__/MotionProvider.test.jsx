import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import MotionProvider from "../MotionProvider";

describe("MotionProvider", () => {
  it("renders application content through the lazy reduced-motion boundary", () => {
    render(
      <MotionProvider>
        <span>motion content</span>
      </MotionProvider>
    );

    expect(screen.getByText("motion content")).toBeInTheDocument();
  });
});
