/**
 * Active organization + workspace.
 *
 * The selection is remembered per browser (a convenience only) and always
 * validated against what the API says the user can access, so a stale or
 * tampered value simply falls back to the first accessible tenant.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Membership, type Organization, type Workspace } from "@/lib/api";
import { useSession } from "@/hooks/useSession";

const ORG_KEY = "atlas.activeOrg";
const WS_KEY = "atlas.activeWorkspace";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}

type TenantContextValue = {
  memberships: Membership[];
  organization: Organization | undefined;
  organizationId: string | null;
  workspaces: Workspace[];
  workspace: Workspace | undefined;
  isLoading: boolean;
  switchOrganization: (id: string) => void;
  switchWorkspace: (id: string) => void;
};

const TenantContext = createContext<TenantContextValue | null>(null);

export const tenantKeys = {
  org: (orgId: string) => ["org", orgId] as const,
  workspaces: (orgId: string) => ["org", orgId, "workspaces"] as const,
  members: (orgId: string) => ["org", orgId, "members"] as const,
  invitations: (orgId: string) => ["org", orgId, "invitations"] as const,
  /** Prefix covering every activity filter — use for invalidation. */
  activityRoot: (orgId: string) => ["org", orgId, "activity"] as const,
  activity: (orgId: string, wsId?: string) => ["org", orgId, "activity", wsId ?? "all"] as const,
  workspaceMembers: (orgId: string, wsId: string) => ["org", orgId, "workspaces", wsId, "members"] as const,
};

export function TenantProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const qc = useQueryClient();
  const memberships = useMemo(() => session.data?.memberships ?? [], [session.data]);

  const [preferredOrg, setPreferredOrg] = useState<string | null>(() => read(ORG_KEY));
  const [preferredWs, setPreferredWs] = useState<string | null>(() => read(WS_KEY));

  const organizationId =
    memberships.find((m) => m.organization_id === preferredOrg)?.organization_id ??
    memberships[0]?.organization_id ??
    null;

  const orgQuery = useQuery({
    queryKey: tenantKeys.org(organizationId ?? "none"),
    queryFn: () => api.orgs.get(organizationId!),
    enabled: !!organizationId,
  });

  const wsQuery = useQuery({
    queryKey: tenantKeys.workspaces(organizationId ?? "none"),
    queryFn: () => api.workspaces.list(organizationId!),
    enabled: !!organizationId,
  });

  const workspaces = useMemo(() => wsQuery.data ?? [], [wsQuery.data]);
  const workspace = workspaces.find((w) => w.id === preferredWs) ?? workspaces[0];

  // Persist the resolved selection so a reload lands in the same place.
  useEffect(() => {
    if (organizationId) write(ORG_KEY, organizationId);
  }, [organizationId]);
  useEffect(() => {
    if (workspace) write(WS_KEY, workspace.id);
  }, [workspace]);

  const switchOrganization = useCallback(
    (id: string) => {
      setPreferredOrg(id);
      setPreferredWs(null);
      write(WS_KEY, null);
      qc.invalidateQueries({ queryKey: tenantKeys.workspaces(id) });
    },
    [qc],
  );

  const switchWorkspace = useCallback((id: string) => setPreferredWs(id), []);

  const value: TenantContextValue = {
    memberships,
    organization: orgQuery.data,
    organizationId,
    workspaces,
    workspace,
    isLoading: orgQuery.isLoading || wsQuery.isLoading,
    switchOrganization,
    switchWorkspace,
  };

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error("useTenant must be used inside <TenantProvider>");
  return ctx;
}
