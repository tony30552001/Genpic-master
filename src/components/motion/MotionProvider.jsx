import { LazyMotion, MotionConfig } from "motion/react";

const loadMotionFeatures = () =>
  import("@/lib/motionFeatures").then((module) => module.default);

export default function MotionProvider({ children }) {
  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={loadMotionFeatures} strict>
        {children}
      </LazyMotion>
    </MotionConfig>
  );
}
