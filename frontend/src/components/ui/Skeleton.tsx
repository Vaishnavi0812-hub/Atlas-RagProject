import { cn } from "@/lib/cn";

/** Shimmering placeholder used while data loads. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "relative overflow-hidden rounded-md bg-graphite-900/[0.06]",
        "after:absolute after:inset-0 after:-translate-x-full after:animate-[shimmer_1.6s_infinite]",
        "after:bg-gradient-to-r after:from-transparent after:via-white/60 after:to-transparent",
        className,
      )}
    />
  );
}
