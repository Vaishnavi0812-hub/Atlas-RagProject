import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { FolderPlus, Globe2, Lock, Pencil, Trash2, Users } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { RoleBadge } from "@/components/ui/RoleBadge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { WorkspaceGlyph } from "@/components/workspace/WorkspaceDot";
import { WorkspaceFormModal } from "@/components/workspace/WorkspaceFormModal";
import { WorkspaceAccessModal } from "@/components/workspace/WorkspaceAccessModal";
import { tenantKeys, useTenant } from "@/context/TenantContext";
import { api, type Workspace } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { hasRole } from "@/lib/roles";
import { staggerContainer } from "@/lib/motion";

export function WorkspacesSettings() {
  const { organization, workspaces, workspace: active, switchWorkspace, isLoading } = useTenant();
  const qc = useQueryClient();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Workspace | null>(null);
  const [access, setAccess] = useState<Workspace | null>(null);
  const [deleting, setDeleting] = useState<Workspace | null>(null);
  const isAdmin = organization ? hasRole(organization.role, "admin") : false;

  const remove = useMutation({
    mutationFn: (ws: Workspace) => api.workspaces.remove(ws.organization_id, ws.id),
    onSuccess: (_, ws) => {
      qc.invalidateQueries({ queryKey: tenantKeys.workspaces(ws.organization_id) });
      qc.invalidateQueries({ queryKey: tenantKeys.org(ws.organization_id) });
      toast({ title: `Deleted ${ws.name}` });
      setDeleting(null);
    },
    onError: (e: Error) => {
      setDeleting(null);
      toast({ title: "Couldn’t delete workspace", description: e.message, tone: "error" });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-xl">Workspaces</h2>
          <p className="mt-1 max-w-xl text-sm text-graphite-600">
            Each workspace has its own documents, knowledge graph, conversations and analytics. Data never crosses
            workspace boundaries.
          </p>
        </div>
        {isAdmin && (
          <Button icon={<FolderPlus className="h-4 w-4" />} onClick={() => setCreating(true)}>
            New workspace
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-44 rounded-2xl" />
          ))}
        </div>
      ) : (
        <motion.div variants={staggerContainer} initial="initial" animate="animate" className="grid gap-4 md:grid-cols-2">
          {workspaces.map((ws) => (
            <Card key={ws.id} className="group flex flex-col p-5">
              <div className="flex items-start gap-3">
                <WorkspaceGlyph name={ws.name} color={ws.color} size="lg" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate font-display text-lg leading-tight">{ws.name}</h3>
                    {ws.id === active?.id && <Badge tone="persimmon">Current</Badge>}
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-graphite-500">
                    {ws.visibility === "restricted" ? (
                      <>
                        <Lock className="h-3 w-3" /> Restricted
                      </>
                    ) : (
                      <>
                        <Globe2 className="h-3 w-3" /> Organization-wide
                      </>
                    )}
                    <span>·</span> Created {formatDate(ws.created_at)}
                  </p>
                </div>
                <RoleBadge role={ws.role} />
              </div>
              <p className="mt-4 line-clamp-2 min-h-[2.5rem] text-sm leading-relaxed text-graphite-600">
                {ws.description || <span className="text-graphite-400">No description.</span>}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-1 border-t hairline pt-3">
                {ws.id !== active?.id && (
                  <Button size="sm" variant="secondary" onClick={() => switchWorkspace(ws.id)}>
                    Open
                  </Button>
                )}
                <Button size="sm" variant="ghost" icon={<Users className="h-3.5 w-3.5" />} onClick={() => setAccess(ws)}>
                  Access
                </Button>
                {ws.permissions.can_manage && (
                  <>
                    <Button size="sm" variant="ghost" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditing(ws)}>
                      Edit
                    </Button>
                    <button
                      onClick={() => setDeleting(ws)}
                      disabled={workspaces.length <= 1}
                      title={workspaces.length <= 1 ? "An organization needs at least one workspace" : "Delete workspace"}
                      className="ml-auto rounded-md p-1.5 text-graphite-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:pointer-events-none disabled:opacity-40"
                      aria-label={`Delete ${ws.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            </Card>
          ))}
        </motion.div>
      )}

      <WorkspaceFormModal open={creating} onClose={() => setCreating(false)} onCreated={(ws) => switchWorkspace(ws.id)} />
      <WorkspaceFormModal open={!!editing} onClose={() => setEditing(null)} workspace={editing ?? undefined} />
      {access && <WorkspaceAccessModal open={!!access} onClose={() => setAccess(null)} workspace={access} />}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting)}
        loading={remove.isPending}
        title="Delete workspace"
        description={
          <>
            This permanently deletes <strong>{deleting?.name}</strong> with its documents, embeddings, knowledge graph
            and conversations.
          </>
        }
        confirmText={deleting?.name}
        confirmLabel="Delete workspace"
      />
    </div>
  );
}
