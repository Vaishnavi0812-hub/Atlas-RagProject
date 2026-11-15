import type { FileType } from "@/lib/api";
import { cn } from "@/lib/cn";

const STYLE: Record<FileType, { label: string; className: string }> = {
  pdf: { label: "PDF", className: "bg-persimmon-500 text-graphite-950" },
  docx: { label: "DOC", className: "bg-cobalt-500 text-white" },
  txt: { label: "TXT", className: "bg-sand-300 text-graphite-800" },
  markdown: { label: "MD", className: "bg-gold-500 text-graphite-950" },
};

/** A small folded-corner document glyph labelled with the file type. */
export function FileTypeIcon({ type, size = "md" }: { type: FileType; size?: "sm" | "md" | "lg" }) {
  const s = STYLE[type] ?? STYLE.txt;
  const dims = { sm: "h-8 w-7 text-[0.5rem]", md: "h-10 w-8 text-[0.55rem]", lg: "h-14 w-11 text-[0.7rem]" }[size];
  return (
    <span aria-hidden className={cn("relative inline-flex shrink-0 items-end justify-center rounded-[5px] pb-1 font-mono font-semibold tracking-wider", dims, s.className)}>
      <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-bl-[4px] bg-black/15 [clip-path:polygon(0_0,100%_100%,0_100%)]" />
      {s.label}
    </span>
  );
}

export const FILE_TYPE_LABEL: Record<FileType, string> = {
  pdf: "PDF",
  docx: "Word",
  txt: "Text",
  markdown: "Markdown",
};
