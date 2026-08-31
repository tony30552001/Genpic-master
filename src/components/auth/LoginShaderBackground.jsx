import { lazy, Suspense, useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";

const MeshGradient = lazy(() =>
  import("@paper-design/shaders-react").then((module) => ({
    default: module.MeshGradient,
  }))
);

const SHADER_COLORS = [
  "#edfaff",
  "#8ad9f5",
  "#5a8ee8",
  "#72d9c4",
];

const supportsWebGl2 = () => {
  if (typeof window.WebGL2RenderingContext !== "function") return false;

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("webgl2", {
    failIfMajorPerformanceCaveat: true,
  });

  context?.getExtension("WEBGL_lose_context")?.loseContext();
  return Boolean(context);
};

export default function LoginShaderBackground() {
  const shouldReduceMotion = useReducedMotion();
  const [hasWebGl2, setHasWebGl2] = useState(false);

  useEffect(() => {
    if (shouldReduceMotion) return;

    const frameId = window.requestAnimationFrame(() => {
      setHasWebGl2(supportsWebGl2());
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [shouldReduceMotion]);

  const canRenderShader = !shouldReduceMotion && hasWebGl2;

  return (
    <div
      className="absolute inset-0 overflow-hidden bg-[#83cbea]"
      aria-hidden="true"
      data-login-shader={canRenderShader ? "active" : "static"}
    >
      {canRenderShader && (
        <Suspense fallback={null}>
          <MeshGradient
            className="h-full w-full"
            colors={SHADER_COLORS}
            distortion={0.58}
            swirl={0.24}
            grainMixer={0.06}
            grainOverlay={0.025}
            speed={0.1}
            fit="cover"
            scale={1.25}
            rotation={-8}
            offsetX={-0.08}
            minPixelRatio={1}
            maxPixelCount={1600 * 1000}
          />
        </Suspense>
      )}

      <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(18,55,83,0.1)_5%,rgba(18,55,83,0.01)_50%,rgba(18,55,83,0.2)_100%)]" />
      <div className="absolute inset-0 opacity-60 [background-image:radial-gradient(circle_at_80%_12%,rgba(255,255,255,0.34),transparent_30%)]" />
    </div>
  );
}
