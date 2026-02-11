import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * 合併 Tailwind CSS class 名稱，自動解決衝突。
 * 這是 shadcn/ui 所有元件的核心工具函式。
 *
 * @example
 * cn("px-4 py-2", isActive && "bg-primary text-primary-foreground")
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
