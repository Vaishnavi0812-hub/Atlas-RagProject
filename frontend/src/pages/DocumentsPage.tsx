import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { FileStack, MoreHorizontal, RotateCcw, Search, SlidersHorizontal, Trash2, Upload, X } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { MenuItem, Popover } from "@/components/ui/Popover";
import { useToast } from "@/components/ui/Toast";
import { UploadPanel } from "@/components/documents/UploadPanel";
import { DocumentDrawer } from "@/components/documents/DocumentDrawer";
import { IngestionSettingsModal } from "@/components/documents/IngestionSettingsModal";
import { FILE_TYPE_LABEL, FileTypeIcon } from "@/components/documents/FileTypeIcon";
import { StatusPill } from "@/components/documents/StatusPill";
import { documentKeys, isActive, useDocumentActions, useDocumentStats, useDocuments, useWorkspaceIds } from "@/hooks/useDocuments";
import type { DocumentItem } from "@/lib/api";
import { formatBytes, formatDuration, formatNumber, timeAgo } from "@/lib/format";
import { cn } from "@/lib/cn";
import { ease, staggerContainer } from "@/lib/motion";

const STATUS_TABS = [
  { value: "", label: "All" },
  { value: "completed", label: "Ready" },
  { value: "in_progress", label: "Processing" },
  { value: "failed", label: "Failed" },
];

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function DocumentsPage() {
  const { orgId, wsId, workspace } = useWorkspaceIds();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const openDoc = params.get("doc");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [fileType, setFileType] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const q = useDebounced(search.trim(), 250);

  const filters = useMemo(() => ({ q: q || undefined, status: status || undefined, file_type: fileType || undefined }), [q, status, fileType]);
  const docs = useDocuments(filters);
  const stats = useDocumentStats();

  const canEdit = !!workspace?.permissions.can_edit;
  const canManage = !!workspace?.permissions.can_manage;
  const filtering = !!(q || status || fileType);
  const libraryEmpty = stats.data?.total === 0;

  const refresh = useCallback(() => {
    if (wsId) qc.invalidateQueries({ queryKey: documentKeys.all(wsId) });
  }, [qc, wsId]);

  const openDocument = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set("doc", id);
    else next.delete("doc");
    setParams(next, { replace: !id });
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={`Workspace · ${workspace?.name ?? "Documents"}`}
        title="Document library"
        description="Every file is validated, extracted, cleaned, chunked and embedded in the background, so you can keep working while large documents process."
        actions={
          <>
            {canManage && workspace && (
              <Button variant="secondary" icon={<SlidersHorizontal className="h-4 w-4" />} onClick={() => setShowSettings(true)}>
                <span className="hidden sm:inline">Ingestion settings</span>
              </Button>
            )}
            {canEdit && !libraryEmpty && (
              <Button icon={showUpload ? <X className="h-4 w-4" /> : <Upload className="h-4 w-4" />} onClick={() => setShowUpload((s) => !s)}>
                {showUpload ? "Close" : "Upload"}
              </Button>
            )}
          </>
        }
      />

      <StatsStrip />

      <AnimatePresence initial={false}>
        {canEdit && orgId && wsId && (showUpload || libraryEmpty) && (
          <motion.section
            key="upload"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto", transition: { duration: 0.35, ease } }}
            exit={{ opacity: 0, height: 0, transition: { duration: 0.2 } }}
            className="overflow-hidden"
          >
            <UploadPanel orgId={orgId} wsId={wsId} onUploaded={refresh} compact={!libraryEmpty} />
          </motion.section>
        )}
      </AnimatePresence>

      {!libraryEmpty && (
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex gap-1 overflow-x-auto rounded-xl bg-white/60 p-1 ring-1 ring-graphite-900/[0.06]">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setStatus(tab.value)}
                className={cn(
                  "relative whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm transition-colors",
                  status === tab.value ? "text-graphite-900" : "text-graphite-500 hover:text-graphite-800",
                )}
              >
                {status === tab.value && (
                  <motion.span layoutId="doc-status-tab" className="absolute inset-0 rounded-lg bg-white shadow-card ring-1 ring-graphite-900/[0.06]" transition={{ type: "spring", stiffness: 450, damping: 36 }} />
                )}
                <span className="relative">{tab.label}</span>
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1 md:w-72 md:flex-none">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-graphite-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by filename"
                aria-label="Search documents"
                className="h-10 w-full rounded-lg bg-white pl-9 pr-3 text-sm shadow-inset outline-none transition-shadow placeholder:text-graphite-400 focus:shadow-[inset_0_0_0_1.5px_#FF7849,0_0_0_4px_rgba(255,120,73,0.12)]"
              />
            </div>
            <Select value={fileType} onChange={(e) => setFileType(e.target.value)} aria-label="Filter by type" className="!h-10 w-32">
              <option value="">All types</option>
              {Object.entries(FILE_TYPE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
        </div>
      )}

      {docs.isLoading || stats.isLoading ? (
        <Card className="space-y-4 p-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-10 w-8" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </Card>
      ) : libraryEmpty ? (
        !canEdit && (
          <EmptyState icon={FileStack} title="No documents yet" description="Editors in this workspace can upload contracts, reports and policies. They’ll appear here as they’re processed." />
        )
      ) : docs.data && docs.data.length === 0 && filtering ? (
        <div className="rounded-2xl border border-dashed border-graphite-900/15 px-6 py-12 text-center">
          <p className="font-display text-lg">No matching documents</p>
          <p className="mt-1 text-sm text-graphite-500">Try a different search or filter.</p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-3"
            onClick={() => {
              setSearch("");
              setStatus("");
              setFileType("");
            }}
          >
            Clear filters
          </Button>
        </div>
      ) : (
        <DocumentTable docs={docs.data ?? []} canEdit={canEdit} onOpen={openDocument} />
      )}

      <DocumentDrawer docId={openDoc} onClose={() => openDocument(null)} />
      {workspace && <IngestionSettingsModal open={showSettings} onClose={() => setShowSettings(false)} workspace={workspace} />}
    </div>
  );
}

// ---------------------------------------------------------------- Stats

function StatsStrip() {
  const { data } = useDocumentStats();
  const items = [
    { label: "Documents", value: data ? formatNumber(data.total) : null, note: data ? formatBytes(data.size_bytes) : "" },
    { label: "Ready", value: data ? formatNumber(data.completed) : null, note: data && data.in_progress ? `${data.in_progress} processing` : "Searchable" },
    { label: "Chunks indexed", value: data ? formatNumber(data.chunks) : null, note: "Embedded in Qdrant" },
    {
      label: "Entities · relations",
      value: data ? (data.graph_extraction_enabled ? `${formatNumber(data.entities)} · ${formatNumber(data.relationships)}` : "—") : null,
      note: data?.graph_extraction_enabled ? "In the knowledge graph" : "Knowledge graph not built yet",
    },
  ];
  return (
    <motion.div variants={staggerContainer} initial="initial" animate="animate" className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-graphite-900/10 lg:grid-cols-4">
      {items.map((item) => (
        <motion.div
          key={item.label}
          variants={{ initial: { opacity: 0 }, animate: { opacity: 1, transition: { duration: 0.4 } } }}
          className="bg-sand-50 px-5 py-4"
        >
          <p className="eyebrow text-[0.6rem]">{item.label}</p>
          {item.value === null ? (
            <Skeleton className="mt-2 h-7 w-16" />
          ) : (
            <p className="mt-1.5 font-display text-[1.75rem] leading-none tabular-nums">{item.value}</p>
          )}
          <p className="mt-1.5 truncate text-xs text-graphite-500">{item.note}</p>
        </motion.div>
      ))}
    </motion.div>
  );
}

// ---------------------------------------------------------------- Table

function DocumentTable({ docs, canEdit, onOpen }: { docs: DocumentItem[]; canEdit: boolean; onOpen: (id: string) => void }) {
  const { reprocess, remove } = useDocumentActions();
  const toast = useToast();
  const [deleting, setDeleting] = useState<DocumentItem | null>(null);

  const retry = (doc: DocumentItem) =>
    reprocess.mutate(doc.id, {
      onSuccess: () => toast({ title: doc.status === "failed" ? `Retrying ${doc.filename}` : `Reprocessing ${doc.filename}` }),
      onError: (e) => toast({ title: "Couldn’t queue processing", description: e.message, tone: "error" }),
    });

  return (
    <Card className="overflow-hidden">
      <div className="hidden grid-cols-[minmax(0,1fr)_170px_80px_90px_90px_40px] gap-4 border-b hairline px-5 py-3 font-mono text-[0.6rem] uppercase tracking-[0.14em] text-graphite-500 md:grid">
        <span>Document</span>
        <span>Status</span>
        <span className="text-right">Chunks</span>
        <span className="text-right">Duration</span>
        <span className="text-right">Uploaded</span>
        <span />
      </div>
      <ul className="divide-y divide-graphite-900/[0.06]">
        <AnimatePresence initial={false}>
          {docs.map((doc, i) => (
            <motion.li
              key={doc.id}
              layout="position"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 10) * 0.03 } }}
              exit={{ opacity: 0, height: 0 }}
              className="group grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-5 py-3.5 transition-colors hover:bg-sand-50 md:grid-cols-[minmax(0,1fr)_170px_80px_90px_90px_40px]"
              onClick={() => onOpen(doc.id)}
            >
              <div className="flex min-w-0 items-center gap-3">
                <FileTypeIcon type={doc.file_type} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-graphite-900 group-hover:text-persimmon-600">{doc.filename}</p>
                  <p className="truncate text-xs text-graphite-500">
                    {FILE_TYPE_LABEL[doc.file_type]} · {formatBytes(doc.size_bytes)}
                    {doc.page_count ? ` · ${doc.page_count} pages` : ""}
                    {doc.status === "failed" && doc.error ? <span className="text-red-600"> · {doc.error}</span> : null}
                  </p>
                </div>
              </div>
              <div className="col-start-1 row-start-2 md:col-auto md:row-auto">
                <StatusPill doc={doc} />
              </div>
              <span className="hidden text-right font-mono text-sm tabular-nums text-graphite-700 md:block">{doc.status === "completed" ? doc.chunk_count : "—"}</span>
              <span className="hidden text-right font-mono text-xs tabular-nums text-graphite-500 md:block">{formatDuration(doc.processing_ms)}</span>
              <span className="hidden text-right text-xs text-graphite-500 md:block" title={new Date(doc.created_at).toLocaleString()}>
                {timeAgo(doc.created_at)}
              </span>
              <div className="row-span-2 flex justify-end md:row-span-1" onClick={(e) => e.stopPropagation()}>
                {canEdit && (
                  <Popover
                    align="end"
                    panelClassName="w-48"
                    trigger={({ toggle }) => (
                      <button onClick={toggle} className="rounded-md p-1.5 text-graphite-400 transition-colors hover:bg-graphite-900/5 hover:text-graphite-800" aria-label={`Actions for ${doc.filename}`}>
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    )}
                  >
                    {(close) => (
                      <>
                        <MenuItem onClick={() => { close(); onOpen(doc.id); }}>View details</MenuItem>
                        {!isActive(doc) && (
                          <MenuItem icon={<RotateCcw className="h-4 w-4" />} onClick={() => { close(); retry(doc); }}>
                            {doc.status === "failed" ? "Retry" : "Reprocess"}
                          </MenuItem>
                        )}
                        <MenuItem tone="danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => { close(); setDeleting(doc); }}>
                          Delete
                        </MenuItem>
                      </>
                    )}
                  </Popover>
                )}
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        loading={remove.isPending}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, {
            onSuccess: () => {
              toast({ title: `Deleted ${deleting.filename}`, description: "Its chunks and vectors were removed." });
              setDeleting(null);
            },
            onError: (e) => toast({ title: "Couldn’t delete document", description: e.message, tone: "error" }),
          })
        }
        title="Delete document?"
        description={<><strong>{deleting?.filename}</strong> will be removed with its chunks and embeddings.</>}
        confirmLabel="Delete document"
      />
    </Card>
  );
}
