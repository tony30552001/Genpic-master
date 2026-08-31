import { cn } from "@/lib/utils";
import { ICON_STROKE_WIDTH, ICON_VIEW_BOX } from "./iconPolicy";

export default function IconSvg({
  children,
  className,
  title,
  "aria-hidden": ariaHidden,
  ...props
}) {
  return (
    <svg
      viewBox={ICON_VIEW_BOX}
      fill="none"
      stroke="currentColor"
      strokeWidth={ICON_STROKE_WIDTH}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("shrink-0", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : ariaHidden ?? true}
      {...props}
    >
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}
