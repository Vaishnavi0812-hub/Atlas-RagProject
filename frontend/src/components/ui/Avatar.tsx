import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";

// Deterministic, palette-constrained avatar colour per person.
const PALETTE = [
  "bg-persimmon-100 text-persimmon-600",
  "bg-cobalt-100 text-cobalt-700",
  "bg-gold-100 text-gold-700",
  "bg-sand-200 text-graphite-800",
  "bg-graphite-800 text-sand-100",
];

function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function Avatar({
  name,
  seed,
  size = "md",
  className,
}: {
  name: string;
  seed?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = { sm: "h-7 w-7 text-[0.65rem]", md: "h-9 w-9 text-xs", lg: "h-14 w-14 text-base" };
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold tracking-wide",
        PALETTE[hash(seed ?? name) % PALETTE.length],
        sizes[size],
        className,
      )}
    >
      {initials(name) || "?"}
    </span>
  );
}
