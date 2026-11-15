import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "persimmon" | "cobalt" | "gold" | "success" | "danger";

const tones: Record<Tone, string> = {
  neutral: "bg-graphite-900/[0.06] text-graphite-700",
  persimmon: "bg-persimmon-100 text-persimmon-600",
  cobalt: "bg-cobalt-100 text-cobalt-700",
  gold: "bg-gold-100 text-gold-700",
  success: "bg-emerald-50 text-emerald-700",
  danger: "bg-red-50 text-red-700",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[0.68rem] font-medium uppercase tracking-wider",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
