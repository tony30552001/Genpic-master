import { Loader2 } from "@/components/icons/lucideStatus"

import { cn } from "@/lib/utils"

function Spinner({
  className,
  ...props
}) {
  return (
    <Loader2
      role="status"
      aria-label="載入中"
      className={cn("size-4 animate-spin motion-reduce:animate-none", className)}
      {...props} />
  );
}

export { Spinner }
