import * as M from "motion/react-m";
import { useReducedMotion } from "motion/react";

import { GLYPH_SPRING } from "@/lib/motionTokens";
import IconSvg from "./IconSvg";

const MODE_LAYOUTS = {
  grid: [
    [4, 4, 4.5, 4.5, 1],
    [9.75, 4, 4.5, 4.5, 1],
    [15.5, 4, 4.5, 4.5, 1],
    [4, 10.5, 4.5, 4.5, 1],
    [9.75, 10.5, 4.5, 4.5, 1],
    [15.5, 10.5, 4.5, 4.5, 1],
  ],
  list: [
    [4, 4.5, 2.25, 2.25, 0.6],
    [8, 4.5, 12, 2.25, 0.7],
    [4, 10.25, 2.25, 2.25, 0.6],
    [8, 10.25, 12, 2.25, 0.7],
    [4, 16, 2.25, 2.25, 0.6],
    [8, 16, 12, 2.25, 0.7],
  ],
  table: [
    [4, 4, 7.25, 4, 0.7],
    [12.75, 4, 7.25, 4, 0.7],
    [4, 9.75, 7.25, 4, 0.7],
    [12.75, 9.75, 7.25, 4, 0.7],
    [4, 15.5, 7.25, 4, 0.7],
    [12.75, 15.5, 7.25, 4, 0.7],
  ],
};

export default function ViewModeGlyph({ mode = "grid", className, title }) {
  const shouldReduceMotion = useReducedMotion();
  const layout = MODE_LAYOUTS[mode] || MODE_LAYOUTS.grid;

  return (
    <IconSvg
      className={className}
      title={title}
      stroke="none"
      fill="currentColor"
      data-view-mode={mode}
    >
      {layout.map(([x, y, width, height, rx], index) => (
        <M.rect
          key={index}
          initial={false}
          animate={{ x, y, width, height, rx }}
          transition={shouldReduceMotion ? { duration: 0.01 } : GLYPH_SPRING}
          opacity={index % 2 === 0 ? 0.95 : 0.58}
        />
      ))}
    </IconSvg>
  );
}
