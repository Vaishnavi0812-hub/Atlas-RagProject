import { useCallback, useRef, useState, type DragEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, CloudUpload, Loader2, X } from "lucide-react";
import { ApiError, uploadDocument, type FileType } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/cn";
import { ease } from "@/lib/motion";
import { FileTypeIcon } from "./FileTypeIcon";

// Mirrors backend limits (app/core/config.py, app/ingestion/validation.py).
const MAX_MB = 50;
const ACCEPT: Record<string, FileType> = { pdf: "pdf", docx: "docx", txt: "txt", md: "markdown", markdown: "markdown" };
const CONCURRENCY = 3;

type Item = {
  id: string;
  file: File;
  type: FileType | null;
  state: "pending" | "uploading" | "queued" | "rejected";
  progress: number;
  message?: string;
};

function typeOf(name: string): FileType | null {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return ACCEPT[ext] ?? null;
}

export function UploadPanel({
  orgId,
  wsId,
  onUploaded,
  compact = false,
}: {
  orgId: string;
  wsId: string;
  onUploaded: () => void;
  compact?: boolean;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const update = (id: string, patch: Partial<Item>) =>
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const start = useCallback(
    async (files: File[]) => {
      const next: Item[] = files.map((file) => {
        const type = typeOf(file.name);
        const id = `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`;
        if (!type) return { id, file, type, state: "rejected", progress: 0, message: "Unsupported type. Use PDF, DOCX, TXT or MD." };
        if (file.size === 0) return { id, file, type, state: "rejected", progress: 0, message: "File is empty." };
        if (file.size > MAX_MB * 1024 * 1024) return { id, file, type, state: "rejected", progress: 0, message: `Larger than ${MAX_MB} MB.` };
        return { id, file, type, state: "pending", progress: 0 };
      });
      setItems((list) => [...next, ...list].slice(0, 30));

      const queue = next.filter((it) => it.state === "pending");
      const worker = async () => {
        for (let item = queue.shift(); item; item = queue.shift()) {
          update(item.id, { state: "uploading" });
          try {
            const result = await uploadDocument(orgId, wsId, item.file, (p) => update(item!.id, { progress: p }));
            if (result.documents.length) update(item.id, { state: "queued", progress: 1 });
            else update(item.id, { state: "rejected", message: result.errors[0]?.error ?? "Rejected by the server." });
          } catch (error) {
            update(item.id, { state: "rejected", message: error instanceof ApiError ? error.message : "Upload failed." });
          }
          onUploaded();
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
    },
    [orgId, wsId, onUploaded],
  );

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) start(files);
  };

  const busy = items.some((i) => i.state === "uploading" || i.state === "pending");

  return (
    <div className="space-y-3">
      <motion.div
        onDragEnter={(e) => {
          e.preventDefault();
          dragDepth.current += 1;
          setDragging(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => {
          dragDepth.current -= 1;
          if (dragDepth.current <= 0) setDragging(false);
        }}
        onDrop={onDrop}
        animate={{ scale: dragging ? 1.01 : 1 }}
        transition={{ duration: 0.2 }}
        className={cn(
          "relative overflow-hidden rounded-2xl border-2 border-dashed transition-colors duration-200",
          dragging ? "border-persimmon-500 bg-persimmon-50" : "border-graphite-900/15 bg-white/50 hover:border-graphite-900/25 hover:bg-white/70",
        )}
      >
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={cn("flex w-full flex-col items-center text-center", compact ? "gap-2 px-6 py-6" : "gap-3 px-6 py-10")}
        >
          <motion.span
            animate={{ y: dragging ? -4 : 0 }}
            className={cn(
              "flex items-center justify-center rounded-xl transition-colors",
              compact ? "h-10 w-10" : "h-12 w-12",
              dragging ? "bg-persimmon-500 text-white" : "bg-graphite-900 text-persimmon-500",
            )}
          >
            <CloudUpload className="h-5 w-5" />
          </motion.span>
          <span className="text-sm font-medium text-graphite-900">
            {dragging ? "Drop to upload" : "Drop files here or click to browse"}
          </span>
          <span className="font-mono text-[0.65rem] uppercase tracking-wider text-graphite-500">
            PDF · DOCX · TXT · Markdown · up to {MAX_MB} MB each
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.txt,.md,.markdown"
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length) start(files);
          }}
        />
      </motion.div>

      <AnimatePresence initial={false}>
        {items.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden rounded-xl bg-white/70 ring-1 ring-graphite-900/[0.06]"
          >
            <div className="flex items-center justify-between border-b hairline px-4 py-2">
              <span className="eyebrow">{busy ? "Uploading" : "Recent uploads"}</span>
              {!busy && (
                <button onClick={() => setItems([])} className="text-xs text-graphite-500 hover:text-graphite-900">
                  Clear
                </button>
              )}
            </div>
            <ul className="max-h-64 divide-y divide-graphite-900/[0.05] overflow-y-auto">
              {items.map((item) => (
                <motion.li
                  key={item.id}
                  layout
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0, transition: { ease } }}
                  className="flex items-center gap-3 px-4 py-2.5"
                >
                  {item.type ? <FileTypeIcon type={item.type} size="sm" /> : <span className="h-8 w-7 rounded bg-graphite-900/10" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{item.file.name}</p>
                    {item.state === "uploading" ? (
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-graphite-900/10">
                        <motion.div className="h-full rounded-full bg-persimmon-500" animate={{ width: `${Math.round(item.progress * 100)}%` }} />
                      </div>
                    ) : (
                      <p className={cn("truncate text-xs", item.state === "rejected" ? "text-red-600" : "text-graphite-500")}>
                        {item.state === "rejected"
                          ? item.message
                          : item.state === "queued"
                            ? `${formatBytes(item.file.size)} · queued for processing`
                            : `${formatBytes(item.file.size)} · waiting`}
                      </p>
                    )}
                  </div>
                  {item.state === "uploading" || item.state === "pending" ? (
                    <Loader2 className="h-4 w-4 animate-spin text-graphite-400" />
                  ) : item.state === "queued" ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                  )}
                  {item.state === "rejected" && (
                    <button
                      onClick={() => setItems((l) => l.filter((i) => i.id !== item.id))}
                      className="rounded p-0.5 text-graphite-400 hover:text-graphite-800"
                      aria-label="Dismiss"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </motion.li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
