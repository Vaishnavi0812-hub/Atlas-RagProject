import { Suspense, lazy, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  Layers,
  ListTree,
  Loader2,
  RotateCcw,
  ScanEye,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { api, type DocumentDetail, type ProcessingJob } from "@/lib/api";
import { formatBytes, formatDate, formatDuration, formatNumber, timeAgo } from "@/lib/format";
import { cn } from "@/lib/cn";
import { ease } from "@/lib/motion";
import { isActive, useChunks, useDocument, useDocumentActions, useWorkspaceIds } from "@/hooks/useDocuments";
import { FILE_TYPE_LABEL, FileTypeIcon } from "./FileTypeIcon";
import { StatusPill } from "./StatusPill";

// pdf.js is large; load it only when a PDF preview is opened.
const PdfViewer = lazy(() => import("./PdfViewer"));

type Tab = "overview" | "processing" | "chunks" | "preview";
const TABS: { id: Tab; label: string; icon: typeof FileText }[] = [
  { id: "overview", label: "Overview", icon: FileText },
  { id: "processing", label: "Processing", icon: ListTree },
  { id: "chunks", label: "Chunks", icon: Layers },
  { id: "preview", label: "Preview", icon: ScanEye },
];

export function DocumentDrawer({ docId, onClose }: { docId: string | null; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("overview");
  const { data: doc, isLoading, isError } = useDocument(docId);

  useEffect(() => {
    if (docId) setTab("overview");
  }, [docId]);

  useEffect(() => {
    if (!docId) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [docId, onClose]);

  return createPortal(
    <AnimatePresence>
      {docId && (
        <div className="fixed inset-0 z-[55]">
          <motion.div
            className="absolute inset-0 bg-graphite-950/30 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="Document details"
            className="absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col bg-sand-50 shadow-lift ring-1 ring-graphite-900/10"
            initial={{ x: "100%" }}
            animate={{ x: 0, transition: { duration: 0.42, ease } }}
            exit={{ x: "100%", transition: { duration: 0.25, ease } }}
          >
            {isLoading || !doc ? (
              <div className="space-y-4 p-6">
                {isError ? (
                  <p className="text-sm text-red-600">This document could not be loaded. It may have been deleted.</p>
                ) : (
                  <>
                    <Skeleton className="h-10 w-2/3" />
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-48 w-full rounded-xl" />
                  </>
                )}
              </div>
            ) : (
              <DrawerContent doc={doc} tab={tab} setTab={setTab} onClose={onClose} />
            )}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function DrawerContent({
  doc,
  tab,
  setTab,
  onClose,
}: {
  doc: DocumentDetail;
  tab: Tab;
  setTab: (t: Tab) => void;
  onClose: () => void;
}) {
  const { orgId, wsId, workspace } = useWorkspaceIds();
  const { reprocess, remove } = useDocumentActions();
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const canEdit = !!workspace?.permissions.can_edit;
  const active = isActive(doc);

  return (
    <>
      <header className="border-b hairline px-6 pb-0 pt-5">
        <div className="flex items-start gap-4">
          <FileTypeIcon type={doc.file_type} size="lg" />
          <div className="min-w-0 flex-1">
            <h2 className="break-words font-display text-xl leading-tight">{doc.filename}</h2>
            <p className="mt-1 text-xs text-graphite-500">
              {FILE_TYPE_LABEL[doc.file_type]} · {formatBytes(doc.size_bytes)} · uploaded {timeAgo(doc.created_at)}
              {doc.uploaded_by_name && ` by ${doc.uploaded_by_name}`}
            </p>
            <div className="mt-3">
              <StatusPill doc={doc} />
            </div>
          </div>
          <button onClick={onClose} className="-mr-2 rounded-lg p-1.5 text-graphite-400 hover:bg-graphite-900/5 hover:text-graphite-800" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {doc.can_download && (
            <a href={api.documents.downloadUrl(orgId!, wsId!, doc.id)} download>
              <Button size="sm" variant="secondary" icon={<Download className="h-3.5 w-3.5" />}>
                Download
              </Button>
            </a>
          )}
          {canEdit && !active && (
            <Button
              size="sm"
              variant={doc.status === "failed" ? "primary" : "secondary"}
              icon={<RotateCcw className="h-3.5 w-3.5" />}
              loading={reprocess.isPending}
              onClick={() =>
                reprocess.mutate(doc.id, {
                  onSuccess: () => toast({ title: doc.status === "failed" ? "Retrying processing" : "Reprocessing queued" }),
                  onError: (e) => toast({ title: "Couldn’t queue processing", description: e.message, tone: "error" }),
                })
              }
            >
              {doc.status === "failed" ? "Retry" : "Reprocess"}
            </Button>
          )}
          {canEdit && (
            <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setConfirmDelete(true)}>
              Delete
            </Button>
          )}
        </div>

        <nav className="-mb-px mt-4 flex gap-1 overflow-x-auto" aria-label="Document sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "relative flex items-center gap-1.5 whitespace-nowrap px-3 pb-3 pt-1 text-sm transition-colors",
                tab === t.id ? "text-graphite-900" : "text-graphite-500 hover:text-graphite-800",
              )}
            >
              <t.icon className={cn("h-4 w-4", tab === t.id && "text-persimmon-600")} strokeWidth={1.75} />
              {t.label}
              {t.id === "chunks" && doc.chunk_count > 0 && (
                <span className="rounded bg-graphite-900/5 px-1.5 font-mono text-[0.65rem]">{doc.chunk_count}</span>
              )}
              {tab === t.id && (
                <motion.span layoutId="doc-tab" className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-persimmon-500" />
              )}
            </button>
          ))}
        </nav>
      </header>

      <div className="scrollbar-thin flex-1 overflow-y-auto px-6 py-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.25 } }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
          >
            {tab === "overview" && <Overview doc={doc} />}
            {tab === "processing" && <Processing doc={doc} />}
            {tab === "chunks" && <Chunks doc={doc} />}
            {tab === "preview" && <Preview doc={doc} />}
          </motion.div>
        </AnimatePresence>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(doc.id, {
            onSuccess: () => {
              toast({ title: `Deleted ${doc.filename}`, description: "Its chunks and vectors were removed." });
              setConfirmDelete(false);
              onClose();
            },
            onError: (e) => toast({ title: "Couldn’t delete document", description: e.message, tone: "error" }),
          })
        }
        title="Delete document?"
        description={
          <>
            <strong>{doc.filename}</strong> will be removed with its {doc.chunk_count} chunks and their embeddings. Answers
            will no longer cite it.
          </>
        }
        confirmLabel="Delete document"
      />
    </>
  );
}

// ---------------------------------------------------------------- Overview

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl bg-white/70 p-3.5 ring-1 ring-graphite-900/[0.06]">
      <dt className="eyebrow text-[0.6rem]">{label}</dt>
      <dd className="mt-1.5 truncate text-sm font-medium text-graphite-900">{value}</dd>
    </div>
  );
}

function Overview({ doc }: { doc: DocumentDetail }) {
  const meta = doc.metadata;
  return (
    <div className="space-y-6">
      {doc.status === "failed" && doc.error && (
        <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Processing failed</p>
            <p className="mt-0.5 text-red-700">{doc.error}</p>
          </div>
        </div>
      )}

      {(meta.title || meta.author) && (
        <div>
          <p className="eyebrow">Document metadata</p>
          {meta.title && <p className="mt-2 font-display text-lg leading-snug">{meta.title}</p>}
          {meta.author && <p className="text-sm text-graphite-600">by {String(meta.author)}</p>}
        </div>
      )}

      <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <Fact label="Pages" value={doc.page_count ?? (doc.file_type === "pdf" ? "—" : "Unpaginated")} />
        <Fact label="Words" value={doc.word_count !== null ? formatNumber(doc.word_count) : "—"} />
        <Fact label="Chunks" value={formatNumber(doc.chunk_count)} />
        <Fact label="Entities" value={<span title="Extracted when the knowledge graph is built">{doc.entity_count || "—"}</span>} />
        <Fact label="Relationships" value={<span title="Extracted when the knowledge graph is built">{doc.relationship_count || "—"}</span>} />
        <Fact label="Processing time" value={formatDuration(doc.processing_ms)} />
        <Fact label="Uploaded" value={formatDate(doc.created_at)} />
        <Fact label="Embedding model" value={<span className="font-mono text-xs">{doc.embedding_model?.split(":").slice(1, 2)[0] ?? "—"}</span>} />
        <Fact label="SHA-256" value={<span className="font-mono text-xs" title={doc.content_hash}>{doc.content_hash.slice(0, 12)}…</span>} />
      </dl>

      {meta.headings && meta.headings.length > 0 && (
        <div>
          <p className="eyebrow">Outline</p>
          <ol className="mt-2 space-y-1 text-sm text-graphite-700">
            {meta.headings.slice(0, 12).map((h, i) => (
              <li key={i} className="flex gap-2">
                <span className="font-mono text-xs text-graphite-400">{String(i + 1).padStart(2, "0")}</span>
                {h}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Processing

const PIPELINE = ["validating", "extracting", "cleaning", "metadata", "chunking", "embedding", "indexing"];
const PIPELINE_LABEL: Record<string, string> = {
  validating: "File validation",
  extracting: "Text extraction",
  cleaning: "Text cleaning",
  metadata: "Metadata extraction",
  chunking: "Chunking",
  embedding: "Embedding generation",
  indexing: "Vector storage",
};

function Processing({ doc }: { doc: DocumentDetail }) {
  const job = doc.jobs[0];
  if (!job) return <p className="text-sm text-graphite-500">No processing runs yet.</p>;
  const done = new Map(job.events.filter((e) => e.stage !== "failed").map((e) => [e.stage, e]));
  const failure = job.events.find((e) => e.stage === "failed");

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-baseline justify-between">
          <p className="eyebrow">Latest run · attempt {job.attempt}</p>
          {job.duration_ms !== null && <span className="font-mono text-xs text-graphite-500">{formatDuration(job.duration_ms)} total</span>}
        </div>
        <ol className="relative mt-4">
          <span className="absolute bottom-3 left-[11px] top-3 w-px bg-graphite-900/10" aria-hidden />
          {PIPELINE.map((stage, i) => {
            const event = done.get(stage);
            const running = !event && job.status === "running" && job.stage === stage;
            const failed = !event && failure && job.stage === stage;
            return (
              <motion.li
                key={stage}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className="relative flex gap-3 pb-4"
              >
                <span
                  className={cn(
                    "relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-4 ring-sand-50",
                    event ? "bg-emerald-500 text-white" : failed ? "bg-red-500 text-white" : running ? "bg-cobalt-500 text-white" : "bg-graphite-900/10 text-graphite-400",
                  )}
                >
                  {event ? <CheckCircle2 className="h-3.5 w-3.5" /> : failed ? <X className="h-3.5 w-3.5" /> : running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className={cn("text-sm font-medium", !event && !running && !failed && "text-graphite-400")}>{PIPELINE_LABEL[stage]}</p>
                    {event?.duration_ms !== undefined && event?.duration_ms !== null && (
                      <span className="shrink-0 font-mono text-[0.7rem] tabular-nums text-graphite-500">{formatDuration(event.duration_ms)}</span>
                    )}
                  </div>
                  {event?.detail && <p className="mt-0.5 text-xs text-graphite-500">{event.detail}</p>}
                  {failed && failure?.detail && <p className="mt-0.5 text-xs text-red-600">{failure.detail}</p>}
                </div>
              </motion.li>
            );
          })}
          <li className="relative flex gap-3">
            <span className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-graphite-900/[0.06] text-graphite-400 ring-4 ring-sand-50">
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
            </span>
            <div className="pt-0.5">
              <p className="text-sm text-graphite-400">Entity &amp; relationship extraction → knowledge graph</p>
              <p className="mt-0.5 text-xs text-graphite-400">Added in the knowledge-graph stage.</p>
            </div>
          </li>
        </ol>
        {job.settings_snapshot.chunk_size && (
          <p className="mt-2 font-mono text-[0.65rem] uppercase tracking-wider text-graphite-400">
            Chunk size {job.settings_snapshot.chunk_size} · overlap {job.settings_snapshot.chunk_overlap}
          </p>
        )}
      </div>

      {doc.jobs.length > 1 && (
        <div>
          <p className="eyebrow">History</p>
          <ul className="mt-3 divide-y divide-graphite-900/[0.06] rounded-xl bg-white/70 ring-1 ring-graphite-900/[0.06]">
            {doc.jobs.map((j) => (
              <JobRow key={j.id} job={j} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const KIND_LABEL = { ingest: "Initial upload", reprocess: "Reprocess", retry: "Retry" } as const;

function JobRow({ job }: { job: ProcessingJob }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3 text-sm">
      <span className="font-mono text-xs text-graphite-400">#{job.attempt}</span>
      <span className="flex-1">
        {KIND_LABEL[job.kind]}
        <span className="text-graphite-500"> · {timeAgo(job.created_at)}{job.triggered_by_name && ` by ${job.triggered_by_name}`}</span>
      </span>
      <Badge tone={job.status === "completed" ? "success" : job.status === "failed" ? "danger" : "cobalt"}>{job.status}</Badge>
      <span className="w-14 text-right font-mono text-xs text-graphite-500">{formatDuration(job.duration_ms)}</span>
    </li>
  );
}

// ---------------------------------------------------------------- Chunks

function Chunks({ doc }: { doc: DocumentDetail }) {
  const [limit, setLimit] = useState(20);
  const { data, isLoading, isFetching } = useChunks(doc.id, doc.status === "completed", limit);

  if (doc.status !== "completed") {
    return <p className="text-sm text-graphite-500">Chunks appear once processing completes.</p>;
  }
  if (isLoading) return <Skeleton className="h-40 w-full rounded-xl" />;
  if (!data) return null;

  return (
    <div className="space-y-3">
      <p className="text-xs text-graphite-500">
        {data.total} {data.total === 1 ? "chunk" : "chunks"}. Each is an exact passage of the cleaned text, embedded and stored with its source location.
      </p>
      {data.items.map((chunk) => (
        <article key={chunk.id} className="rounded-xl bg-white/80 p-4 ring-1 ring-graphite-900/[0.06]">
          <header className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[0.65rem] uppercase tracking-wider text-graphite-500">
            <span className="text-persimmon-600">#{chunk.chunk_index + 1}</span>
            {chunk.page_number !== null && (
              <span>
                Page {chunk.page_number}
                {chunk.page_end && chunk.page_end !== chunk.page_number ? `–${chunk.page_end}` : ""}
              </span>
            )}
            <span>~{chunk.token_estimate} tokens</span>
            <span>chars {formatNumber(chunk.char_start)}–{formatNumber(chunk.char_end)}</span>
          </header>
          <p className="whitespace-pre-line text-sm leading-relaxed text-graphite-800">{chunk.content}</p>
        </article>
      ))}
      {data.items.length < data.total && (
        <div className="flex justify-center pt-2">
          <Button size="sm" variant="secondary" loading={isFetching} onClick={() => setLimit((l) => l + 20)}>
            Show more ({data.total - data.items.length} remaining)
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Preview

function Preview({ doc }: { doc: DocumentDetail }) {
  const { orgId, wsId } = useWorkspaceIds();
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const url = api.documents.fileUrl(orgId!, wsId!, doc.id);
  const isText = doc.file_type === "txt" || doc.file_type === "markdown";

  useEffect(() => {
    if (!isText || !doc.can_download) return;
    let cancelled = false;
    fetch(url, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.text() : Promise.reject()))
      .then((t) => !cancelled && setText(t))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [url, isText, doc.can_download]);

  if (!doc.can_download) {
    return <p className="text-sm text-graphite-500">Viewing the original file is disabled for viewers in this workspace. Extracted passages are in the Chunks tab.</p>;
  }
  if (doc.file_type === "pdf") {
    return (
      <Suspense fallback={<Skeleton className="h-[70vh] w-full rounded-xl" />}>
        <PdfViewer url={url} />
      </Suspense>
    );
  }
  if (doc.file_type === "docx") {
    return (
      <p className="text-sm text-graphite-500">
        Word documents can’t be rendered in the browser. Download the original, or read the extracted text in the Chunks tab.
      </p>
    );
  }
  if (failed) return <p className="text-sm text-red-600">The file could not be loaded.</p>;
  if (text === null) return <Skeleton className="h-64 w-full rounded-xl" />;
  return (
    <pre className="scrollbar-thin max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-xl bg-white p-5 font-mono text-[0.8rem] leading-relaxed text-graphite-800 ring-1 ring-graphite-900/10">
      {text}
    </pre>
  );
}
