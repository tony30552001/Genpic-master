import * as M from "motion/react-m";
import { useReducedMotion } from "motion/react";

import { GLYPH_SPRING } from "@/lib/motionTokens";
import IconSvg from "./IconSvg";

export default function ThemeGlyph({ isDark, className, title }) {
  const shouldReduceMotion = useReducedMotion();
  const transition = shouldReduceMotion ? { duration: 0.01 } : GLYPH_SPRING;

  return (
    <IconSvg className={className} title={title} data-theme-glyph={isDark ? "dark" : "light"}>
      <M.g
        initial={false}
        animate={{
          opacity: isDark ? 0 : 1,
          scale: isDark || shouldReduceMotion ? 0.86 : 1,
          rotate: isDark || shouldReduceMotion ? -12 : 0,
        }}
        transition={transition}
        style={{ transformOrigin: "12px 12px" }}
      >
        <circle cx="12" cy="12" r="3.75" />
        <path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M5.95 5.95l1.4 1.4M16.65 16.65l1.4 1.4M18.05 5.95l-1.4 1.4M7.35 16.65l-1.4 1.4" />
      </M.g>
      <M.g
        initial={false}
        animate={{
          opacity: isDark ? 1 : 0,
          scale: isDark || shouldReduceMotion ? 1 : 0.86,
          rotate: isDark || shouldReduceMotion ? 0 : 12,
        }}
        transition={transition}
        style={{ transformOrigin: "12px 12px" }}
      >
        <path d="M18.25 15.2A7.25 7.25 0 0 1 8.8 5.75 7.5 7.5 0 1 0 18.25 15.2Z" />
        <rect x="16.75" y="5" width="1.5" height="1.5" rx="0.35" fill="currentColor" stroke="none" />
      </M.g>
    </IconSvg>
  );
}
