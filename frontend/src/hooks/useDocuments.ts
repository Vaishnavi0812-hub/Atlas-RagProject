import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type DocumentFilters, type DocumentItem } from "@/lib/api";
import { useTenant } from "@/context/TenantContext";

const ACTIVE = new Set(["queued", "processing"]);
const POLL_MS = 1500;

export const documentKeys = {
  all: (wsId: string) => ["workspace", wsId, "documents"] as const,
  list: (wsId: string, filters: DocumentFilters) => ["workspace", wsId, "documents", "list", filters] as const,
  stats: (wsId: string) => ["workspace", wsId, "documents", "stats"] as const,
  detail: (wsId: string, docId: string) => ["workspace", wsId, "documents", "detail", docId] as const,
  chunks: (wsId: string, docId: string) => ["workspace", wsId, "documents", "chunks", docId] as const,
};

export const isActive = (doc: Pick<DocumentItem, "status">) => ACTIVE.has(doc.status);

/** The current workspace's ids, or nulls while the tenant is loading. */
export function useWorkspaceIds() {
  const { organizationId, workspace } = useTenant();
  return { orgId: organizationId, wsId: workspace?.id ?? null, workspace };
}

export function useDocuments(filters: DocumentFilters) {
  const { orgId, wsId } = useWorkspaceIds();
  return useQuery({
    queryKey: documentKeys.list(wsId ?? "none", filters),
    queryFn: () => api.documents.list(orgId!, wsId!, filters),
    enabled: !!orgId && !!wsId,
    // Poll only while something is being processed: real progress, no idle traffic.
    refetchInterval: (query) => (query.state.data?.some(isActive) ? POLL_MS : false),
    staleTime: 0,
  });
}

/**
 * Workspace totals. Refetched whenever any document's status or chunk count
 * changes (derived from the polled list), so totals settle with the last change.
 */
export function useDocumentStats() {
  const { orgId, wsId } = useWorkspaceIds();
  const qc = useQueryClient();
  const docs = useDocuments({});
  const fingerprint = docs.data?.map((d) => `${d.id}:${d.status}:${d.chunk_count}`).join("|");

  useEffect(() => {
    if (wsId && fingerprint !== undefined) qc.invalidateQueries({ queryKey: documentKeys.stats(wsId) });
  }, [fingerprint, qc, wsId]);

  return useQuery({
    queryKey: documentKeys.stats(wsId ?? "none"),
    queryFn: () => api.documents.stats(orgId!, wsId!),
    enabled: !!orgId && !!wsId,
    staleTime: 0,
  });
}

export function useDocument(docId: string | null) {
  const { orgId, wsId } = useWorkspaceIds();
  return useQuery({
    queryKey: documentKeys.detail(wsId ?? "none", docId ?? "none"),
    queryFn: () => api.documents.get(orgId!, wsId!, docId!),
    enabled: !!orgId && !!wsId && !!docId,
    refetchInterval: (query) => (query.state.data && isActive(query.state.data) ? POLL_MS : false),
    staleTime: 0,
  });
}

export function useChunks(docId: string | null, enabled: boolean, limit: number) {
  const { orgId, wsId } = useWorkspaceIds();
  return useQuery({
    queryKey: [...documentKeys.chunks(wsId ?? "none", docId ?? "none"), limit],
    queryFn: () => api.documents.chunks(orgId!, wsId!, docId!, 0, limit),
    enabled: enabled && !!orgId && !!wsId && !!docId,
    placeholderData: (prev) => prev,
  });
}

export function useDocumentActions() {
  const { orgId, wsId } = useWorkspaceIds();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: documentKeys.all(wsId!) });

  const reprocess = useMutation({
    mutationFn: (docId: string) => api.documents.reprocess(orgId!, wsId!, docId),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (docId: string) => api.documents.remove(orgId!, wsId!, docId),
    onSuccess: invalidate,
  });
  return { reprocess, remove, invalidate };
}
