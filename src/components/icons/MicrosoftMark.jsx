import { cn } from "@/lib/utils";

export default function MicrosoftMark({ className }) {
  return (
    <svg
      viewBox="0 0 256 256"
      className={cn("shrink-0", className)}
      aria-hidden="true"
    >
      <path fill="#f1511b" d="M121.666 121.666H0V0h121.666z" />
      <path fill="#80cc28" d="M256 121.666H134.335V0H256z" />
      <path fill="#00adef" d="M121.663 256.002H0V134.336h121.663z" />
      <path fill="#fbbc09" d="M256 256.002H134.335V134.336H256z" />
    </svg>
  );
}
