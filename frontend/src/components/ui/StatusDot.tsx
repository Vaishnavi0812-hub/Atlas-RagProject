import { cn } from "@/lib/cn";

export function StatusDot({ status }: { status: "ok" | "error" | "loading" }) {
  const color =
    status === "ok" ? "bg-emerald-500" : status === "error" ? "bg-persimmon-500" : "bg-gold-500";
  return (
    <span className="relative inline-flex h-2 w-2">
      {status !== "error" && (
        <span
          className={cn("absolute inset-0 animate-ping rounded-full opacity-50", color)}
          style={{ animationDuration: status === "loading" ? "1s" : "2.4s" }}
        />
      )}
      <span className={cn("relative inline-flex h-2 w-2 rounded-full", color)} />
    </span>
  );
}
