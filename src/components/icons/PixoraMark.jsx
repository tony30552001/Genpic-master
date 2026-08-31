import * as M from "motion/react-m";
import { useReducedMotion } from "motion/react";

import { GLYPH_SPRING } from "@/lib/motionTokens";
import IconSvg from "./IconSvg";

export default function PixoraMark({ active = false, className, title }) {
  const shouldReduceMotion = useReducedMotion();
  const pixelOffset = shouldReduceMotion || active ? 0 : 0.75;

  return (
    <IconSvg className={className} title={title} stroke="none" data-pixora-mark="">
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M5.75 4.5h6.1a5.15 5.15 0 0 1 0 10.3H9.5v4.7H5.75v-15Zm3.75 3v4.3h2.15a2.15 2.15 0 1 0 0-4.3H9.5Z"
        clipRule="evenodd"
      />
      <M.g
        initial={false}
        animate={{ x: pixelOffset, y: pixelOffset, opacity: active ? 1 : 0.82 }}
        transition={GLYPH_SPRING}
      >
        <rect x="14.75" y="14.75" width="2.75" height="2.75" rx="0.55" fill="currentColor" />
        <rect x="18.25" y="14.75" width="2" height="2" rx="0.4" fill="currentColor" opacity="0.6" />
        <rect x="14.75" y="18.25" width="2" height="2" rx="0.4" fill="currentColor" opacity="0.38" />
      </M.g>
    </IconSvg>
  );
}
