import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Clock3, Loader2 } from "lucide-react";
import type { DocumentItem } from "@/lib/api";
import { cn } from "@/lib/cn";

/** Status with live progress for documents being processed. */
export function StatusPill({ doc, compact = false }: { doc: Pick<DocumentItem, "status" | "stage_label" | "progress" | "error">; compact?: boolean }) {
  if (doc.status === "completed") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" /> Ready
      </span>
    );
  }
  if (doc.status === "failed") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600" title={doc.error ?? undefined}>
        <AlertTriangle className="h-3.5 w-3.5" /> Failed
      </span>
    );
  }
  const queued = doc.status === "queued";
  return (
    <div className={cn("min-w-0", compact ? "w-28" : "w-40")}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="inline-flex min-w-0 items-center gap-1.5 font-medium text-cobalt-700">
          {queued ? <Clock3 className="h-3.5 w-3.5 shrink-0" /> : <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />}
          <span className="truncate">{queued ? "Queued" : doc.stage_label}</span>
        </span>
        <span className="font-mono text-[0.65rem] tabular-nums text-graphite-500">{doc.progress}%</span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-cobalt-100">
        <motion.div
          className="relative h-full rounded-full bg-cobalt-500"
          initial={false}
          animate={{ width: `${Math.max(doc.progress, queued ? 2 : 4)}%` }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="absolute inset-0 animate-[shimmer_1.4s_infinite] bg-gradient-to-r from-transparent via-white/50 to-transparent" />
        </motion.div>
      </div>
    </div>
  );
}
