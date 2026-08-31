import * as M from "motion/react-m";
import { useReducedMotion } from "motion/react";

import { GENERATION_LOOP, GLYPH_SUCCESS } from "@/lib/motionTokens";
import IconSvg from "./IconSvg";

const PIXELS = [
  { x: 15.25, y: 14.75, size: 2.5, delay: 0 },
  { x: 18.25, y: 14.75, size: 1.8, delay: 0.18 },
  { x: 15.25, y: 17.75, size: 1.8, delay: 0.36 },
];

export default function GenerationSignature({
  state = "working",
  className,
  title,
}) {
  const shouldReduceMotion = useReducedMotion();
  const isWorking = state === "working";
  const isSuccess = state === "success";

  return (
    <IconSvg className={className} title={title} stroke="none" data-generation-signature={state}>
      <M.rect
        x="2.75"
        y="2.75"
        width="18.5"
        height="18.5"
        rx="5"
        fill="currentColor"
        opacity="0.08"
        initial={false}
        animate={{
          opacity: isWorking && !shouldReduceMotion ? [0.06, 0.12, 0.06] : 0.08,
        }}
        transition={isWorking && !shouldReduceMotion ? GENERATION_LOOP : { duration: 0.01 }}
      />
      <M.path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M6.5 5.75h5.25a4.45 4.45 0 0 1 0 8.9H9.8v3.6H6.5V5.75Zm3.3 2.8v3.3h1.8a1.65 1.65 0 1 0 0-3.3H9.8Z"
        initial={false}
        animate={{
          opacity: isSuccess ? 0.16 : 0.9,
          scale: isSuccess ? 0.88 : isWorking && !shouldReduceMotion ? [0.98, 1, 0.98] : 1,
        }}
        transition={isWorking && !shouldReduceMotion ? GENERATION_LOOP : GLYPH_SUCCESS}
        style={{ transformOrigin: "11px 12px" }}
      />
      {PIXELS.map((pixel) => (
        <M.rect
          key={`${pixel.x}-${pixel.y}`}
          x={pixel.x}
          y={pixel.y}
          width={pixel.size}
          height={pixel.size}
          rx="0.5"
          fill="currentColor"
          initial={false}
          animate={
            isWorking && !shouldReduceMotion
              ? {
                  x: [pixel.x + 0.8, pixel.x, pixel.x + 0.8],
                  y: [pixel.y + 0.8, pixel.y, pixel.y + 0.8],
                  opacity: [0.28, 0.95, 0.28],
                }
              : {
                  x: pixel.x,
                  y: pixel.y,
                  opacity: isSuccess ? 0.12 : 0.72,
                }
          }
          transition={
            isWorking && !shouldReduceMotion
              ? { ...GENERATION_LOOP, delay: pixel.delay }
              : GLYPH_SUCCESS
          }
        />
      ))}
      <M.path
        d="m7.25 12.5 3 3 6.5-7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={false}
        animate={{ pathLength: isSuccess ? 1 : 0, opacity: isSuccess ? 1 : 0 }}
        transition={shouldReduceMotion ? { duration: 0.01 } : GLYPH_SUCCESS}
      />
    </IconSvg>
  );
}
