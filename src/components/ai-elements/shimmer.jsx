import * as M from "motion/react-m";
import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/** Text with a sweeping highlight for in-progress status; static under reduced motion. */
export const Shimmer = ({ children, className, duration = 2, spread = 2 }) => {
  const shouldReduceMotion = useReducedMotion();
  const sweep = `${String(children ?? "").length * spread}px`;

  if (shouldReduceMotion) {
    return <span className={cn("text-muted-foreground", className)}>{children}</span>;
  }

  return (
    <M.span
      animate={{ backgroundPosition: "0% center" }}
      className={cn(
        "relative inline-block bg-[length:250%_100%,auto] bg-clip-text text-transparent",
        "[--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--color-background),#0000_calc(50%+var(--spread)))] [background-repeat:no-repeat,padding-box]",
        className
      )}
      initial={{ backgroundPosition: "100% center" }}
      style={{
        "--spread": sweep,
        backgroundImage:
          "var(--bg), linear-gradient(var(--color-muted-foreground), var(--color-muted-foreground))",
      }}
      transition={{ duration, ease: "linear", repeat: Number.POSITIVE_INFINITY }}
    >
      {children}
    </M.span>
  );
};
