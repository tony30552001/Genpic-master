import * as M from "motion/react-m";
import { useReducedMotion } from "motion/react";

import { GLYPH_SPRING } from "@/lib/motionTokens";
import IconSvg from "./IconSvg";
import { PRODUCT_GLYPH_KINDS } from "./iconPolicy";

const ACCENTS = {
  create: [[4, 4], [18, 5], [17, 18]],
  document: [[4, 7], [18, 5], [18, 18]],
  transform: [[4, 5], [18, 4], [17, 18]],
  library: [[4, 5], [18, 8], [17, 19]],
  deck: [[4, 7], [18, 5], [18, 17]],
  settings: [[4, 5], [18, 10], [5, 18]],
};

function GlyphShape({ kind }) {
  switch (kind) {
    case "document":
      return (
        <>
          <path d="M7 3.75h6.25L17 7.5v12.75H7z" />
          <path d="M13.25 3.75V7.5H17M9.5 11h5M9.5 14h5M9.5 17h3" />
        </>
      );
    case "transform":
      return (
        <>
          <rect x="4.75" y="6.25" width="10.5" height="10.5" rx="2" />
          <rect x="8.75" y="3.75" width="10.5" height="10.5" rx="2" />
          <path d="m8 13 2-2 1.75 1.75M16 8l-2 2-1.75-1.75" />
        </>
      );
    case "library":
      return (
        <>
          <rect x="5" y="5" width="13.5" height="13.5" rx="2.25" />
          <path d="M7.75 2.75h10.5A3 3 0 0 1 21.25 5.75v10.5M2.75 7.75v10.5a3 3 0 0 0 3 3h10.5" />
          <path d="M8 9h7.5M8 12h5.5M8 15h4" />
        </>
      );
    case "deck":
      return (
        <>
          <rect x="5" y="6" width="14" height="10.5" rx="2" />
          <path d="M7.5 3.75h9A3.25 3.25 0 0 1 19.75 7M7.5 19.25h9A3.25 3.25 0 0 0 19.75 16" />
          <path d="M8 9.25h4.5M8 12.25h8" />
        </>
      );
    case "settings":
      return (
        <>
          <path d="M5 6h14M5 12h14M5 18h14" />
          <rect x="7" y="4" width="3.5" height="4" rx="1" fill="currentColor" stroke="none" />
          <rect x="14" y="10" width="3.5" height="4" rx="1" fill="currentColor" stroke="none" />
          <rect x="9.5" y="16" width="3.5" height="4" rx="1" fill="currentColor" stroke="none" />
        </>
      );
    case "create":
    default:
      return (
        <>
          <rect x="5" y="5" width="14" height="14" rx="3" />
          <path d="M8.25 14.75 11 12l2.1 2.1 2.35-2.35 1.3 1.3M8.25 9.25h4.5" />
        </>
      );
  }
}

export default function ProductGlyph({
  kind = "create",
  active = false,
  className,
  title,
}) {
  const shouldReduceMotion = useReducedMotion();
  const safeKind = PRODUCT_GLYPH_KINDS.includes(kind) ? kind : "create";
  const accents = ACCENTS[safeKind];

  return (
    <IconSvg
      className={className}
      title={title}
      data-product-glyph={safeKind}
      data-active={active ? "true" : "false"}
    >
      <M.g
        initial={false}
        animate={
          shouldReduceMotion
            ? { opacity: 1 }
            : { scale: active ? 1 : 0.97, opacity: active ? 1 : 0.86 }
        }
        transition={GLYPH_SPRING}
        style={{ transformOrigin: "12px 12px" }}
      >
        <GlyphShape kind={safeKind} />
      </M.g>
      <M.g
        initial={false}
        animate={
          shouldReduceMotion
            ? { opacity: active ? 0.9 : 0.55 }
            : {
                x: active ? 0 : 0.7,
                y: active ? 0 : 0.7,
                opacity: active ? 0.95 : 0.5,
              }
        }
        transition={GLYPH_SPRING}
        stroke="none"
        fill="currentColor"
      >
        {accents.map(([x, y], index) => (
          <rect
            key={`${safeKind}-${x}-${y}`}
            x={x}
            y={y}
            width={index === 0 ? 1.75 : 1.35}
            height={index === 0 ? 1.75 : 1.35}
            rx="0.35"
          />
        ))}
      </M.g>
    </IconSvg>
  );
}
