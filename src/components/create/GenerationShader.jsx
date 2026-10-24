import { lazy, Suspense, useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";

const ImageGeneration = lazy(() =>
  import("img-fx").then((module) => ({ default: module.ImageGeneration }))
);

const SHADER_STYLE = { position: "absolute", inset: 0, display: "block" };

const supportsWebGl = () => {
  if (typeof window.WebGLRenderingContext !== "function") return false;

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("webgl", {
    failIfMajorPerformanceCaveat: true,
  });

  context?.getExtension("WEBGL_lose_context")?.loseContext();
  return Boolean(context);
};

/**
 * WebGL pixel-mosaic loader that fills its positioned parent. `fallback` is shown while the
 * shader chunk loads and whenever WebGL or motion is unavailable.
 */
export default function GenerationShader({ fallback }) {
  const shouldReduceMotion = useReducedMotion();
  const [hasWebGl, setHasWebGl] = useState(false);

  useEffect(() => {
    if (shouldReduceMotion) return;

    const frameId = window.requestAnimationFrame(() => {
      setHasWebGl(supportsWebGl());
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [shouldReduceMotion]);

  if (shouldReduceMotion || !hasWebGl) return fallback;

  return (
    <Suspense fallback={fallback}>
      <ImageGeneration
        preset="pixels-organic"
        className="generation-shader"
        style={SHADER_STYLE}
        aria-hidden="true"
      >
        <div className="h-full w-full" />
      </ImageGeneration>
    </Suspense>
  );
}
