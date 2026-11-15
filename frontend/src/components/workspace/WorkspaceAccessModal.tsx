import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe2, Lock, Plus, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import { Avatar } from "@/components/ui/Avatar";
import { RoleBadge } from "@/components/ui/RoleBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { api, type Workspace } from "@/lib/api";
import { hasRole } from "@/lib/roles";
import { tenantKeys, useTenant } from "@/context/TenantContext";

const ACCESS_LABEL = {
  organization_admin: "Admin access",
  organization_wide: "Organization-wide",
  granted: "Granted",
} as const;

export function WorkspaceAccessModal({
  open,
  onClose,
  workspace,
}: {
  open: boolean;
  onClose: () => void;
  workspace: Workspace;
}) {
  const { organizationId } = useTenant();
  const orgId = organizationId!;
  const qc = useQueryClient();
  const toast = useToast();
  const [pickUser, setPickUser] = useState("");
  const [pickRole, setPickRole] = useState<"editor" | "viewer">("viewer");

  const access = useQuery({
    queryKey: tenantKeys.workspaceMembers(orgId, workspace.id),
    queryFn: () => api.workspaces.members(orgId, workspace.id),
    enabled: open,
  });
  const orgMembers = useQuery({
    queryKey: tenantKeys.members(orgId),
    queryFn: () => api.orgs.members(orgId),
    enabled: open,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: tenantKeys.workspaceMembers(orgId, workspace.id) });
    qc.invalidateQueries({ queryKey: tenantKeys.activityRoot(orgId) });
  };

  const grant = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: "editor" | "viewer" }) =>
      api.workspaces.grant(orgId, workspace.id, userId, role),
    onSuccess: (m) => {
      refresh();
      setPickUser("");
      toast({ title: `${m.full_name} now has ${m.effective_role} access` });
    },
    onError: (e: Error) => toast({ title: "Couldn’t grant access", description: e.message, tone: "error" }),
  });

  const revoke = useMutation({
    mutationFn: (userId: string) => api.workspaces.revoke(orgId, workspace.id, userId),
    onSuccess: () => {
      refresh();
      toast({ title: "Access removed" });
    },
    onError: (e: Error) => toast({ title: "Couldn’t remove access", description: e.message, tone: "error" }),
  });

  const withAccess = new Set(access.data?.map((m) => m.user_id));
  const candidates = (orgMembers.data ?? []).filter(
    (m) => !withAccess.has(m.user_id) && !hasRole(m.role, "admin"),
  );
  const restricted = workspace.visibility === "restricted";

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={`Access · ${workspace.name}`}
      description={
        <span className="inline-flex items-center gap-1.5">
          {restricted ? <Lock className="h-3.5 w-3.5" /> : <Globe2 className="h-3.5 w-3.5" />}
          {restricted
            ? "Restricted: only admins and the people below can open this workspace."
            : "Open to the whole organization. Members act with their organization role."}
        </span>
      }
    >
      <div className="space-y-6">
        {restricted && (
          <div className="rounded-xl bg-white/70 p-4 ring-1 ring-graphite-900/[0.06]">
            <p className="text-[0.8rem] font-medium">Grant access</p>
            {candidates.length === 0 && !orgMembers.isLoading ? (
              <p className="mt-2 text-xs text-graphite-500">
                Everyone in the organization already has access. Invite more people from Members.
              </p>
            ) : (
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <Select value={pickUser} onChange={(e) => setPickUser(e.target.value)} className="sm:flex-1">
                  <option value="">Choose a member…</option>
                  {candidates.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.full_name} · {m.email}
                    </option>
                  ))}
                </Select>
                <Select value={pickRole} onChange={(e) => setPickRole(e.target.value as "editor" | "viewer")} className="sm:w-32">
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                </Select>
                <Button
                  icon={<Plus className="h-4 w-4" />}
                  disabled={!pickUser}
                  loading={grant.isPending}
                  onClick={() => grant.mutate({ userId: pickUser, role: pickRole })}
                  className="h-11"
                >
                  Add
                </Button>
              </div>
            )}
            <p className="mt-2 text-xs text-graphite-500">
              A grant never exceeds someone’s organization role. A viewer granted editor stays a viewer.
            </p>
          </div>
        )}

        <div>
          <p className="eyebrow">People with access</p>
          <ul className="mt-3 divide-y divide-graphite-900/[0.06]">
            {access.isLoading &&
              Array.from({ length: 3 }).map((_, i) => (
                <li key={i} className="flex items-center gap-3 py-3">
                  <Skeleton className="h-9 w-9 rounded-full" />
                  <Skeleton className="h-4 w-40" />
                </li>
              ))}
            {access.data?.map((m) => (
              <li key={m.user_id} className="flex items-center gap-3 py-3">
                <Avatar name={m.full_name} seed={m.user_id} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.full_name}</p>
                  <p className="truncate text-xs text-graphite-500">
                    {m.email} · {ACCESS_LABEL[m.access]}
                  </p>
                </div>
                {m.access === "granted" ? (
                  <div className="flex items-center gap-1.5">
                    <Select
                      size="sm"
                      value={m.workspace_role ?? "viewer"}
                      onChange={(e) =>
                        grant.mutate({ userId: m.user_id, role: e.target.value as "editor" | "viewer" })
                      }
                      className="w-28"
                      aria-label={`Workspace role for ${m.full_name}`}
                    >
                      <option value="viewer">Viewer</option>
                      <option value="editor">Editor</option>
                    </Select>
                    <button
                      onClick={() => revoke.mutate(m.user_id)}
                      className="rounded-md p-1.5 text-graphite-400 transition-colors hover:bg-red-50 hover:text-red-600"
                      aria-label={`Remove ${m.full_name}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <RoleBadge role={m.effective_role} />
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Modal>
  );
}
