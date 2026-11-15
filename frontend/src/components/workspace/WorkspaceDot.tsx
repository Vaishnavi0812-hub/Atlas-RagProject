import type { WorkspaceColor } from "@/lib/api";
import { WORKSPACE_COLORS } from "@/lib/roles";
import { cn } from "@/lib/cn";

/** Square workspace glyph: brand colour + first letter. */
export function WorkspaceGlyph({
  name,
  color,
  size = "md",
}: {
  name: string;
  color: WorkspaceColor;
  size?: "sm" | "md" | "lg";
}) {
  const c = WORKSPACE_COLORS[color] ?? WORKSPACE_COLORS.persimmon;
  const sizes = { sm: "h-5 w-5 text-[0.6rem] rounded", md: "h-6 w-6 text-xs rounded-md", lg: "h-10 w-10 text-base rounded-lg" };
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center font-display font-semibold", sizes[size])}
      style={{ backgroundColor: c.hex, color: c.text }}
    >
      {name.trim()[0]?.toUpperCase() ?? "W"}
    </span>
  );
}
