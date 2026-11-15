import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Check, ChevronsUpDown, Lock, Plus, Settings2 } from "lucide-react";
import { MenuDivider, MenuItem, MenuLabel, Popover } from "@/components/ui/Popover";
import { Skeleton } from "@/components/ui/Skeleton";
import { WorkspaceGlyph } from "@/components/workspace/WorkspaceDot";
import { WorkspaceFormModal } from "@/components/workspace/WorkspaceFormModal";
import { CreateOrganizationModal } from "@/components/workspace/CreateOrganizationModal";
import { useTenant } from "@/context/TenantContext";
import { ROLE_LABEL, hasRole } from "@/lib/roles";

export function TenantSwitcher() {
  const { memberships, organization, organizationId, workspaces, workspace, switchOrganization, switchWorkspace } =
    useTenant();
  const navigate = useNavigate();
  const [creatingWs, setCreatingWs] = useState(false);
  const [creatingOrg, setCreatingOrg] = useState(false);

  const orgRole = memberships.find((m) => m.organization_id === organizationId)?.role ?? "viewer";
  const canCreateWorkspace = hasRole(orgRole, "admin");

  if (!organization || !workspace) {
    return <Skeleton className="h-8 w-56" />;
  }

  return (
    <>
      <Popover
        panelClassName="w-[300px]"
        trigger={({ open, toggle }) => (
          <button
            onClick={toggle}
            aria-expanded={open}
            aria-haspopup="menu"
            className="flex max-w-[52vw] items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-graphite-900/5 sm:max-w-none"
          >
            <WorkspaceGlyph name={workspace.name} color={workspace.color} />
            <span className="hidden truncate font-medium text-graphite-900 sm:inline">{organization.name}</span>
            <span className="hidden text-graphite-300 sm:inline">/</span>
            <span className="truncate text-graphite-700">{workspace.name}</span>
            {workspace.visibility === "restricted" && <Lock className="h-3 w-3 shrink-0 text-graphite-400" />}
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-graphite-400" />
          </button>
        )}
      >
        {(close) => (
          <div className="max-h-[70vh] overflow-y-auto">
            <MenuLabel>Workspaces · {organization.name}</MenuLabel>
            {workspaces.map((ws) => (
              <MenuItem
                key={ws.id}
                active={ws.id === workspace.id}
                icon={<WorkspaceGlyph name={ws.name} color={ws.color} size="sm" />}
                onClick={() => {
                  switchWorkspace(ws.id);
                  close();
                }}
                trailing={
                  ws.id === workspace.id ? (
                    <Check className="h-4 w-4 text-persimmon-600" />
                  ) : ws.visibility === "restricted" ? (
                    <Lock className="h-3 w-3 text-graphite-400" />
                  ) : null
                }
              >
                {ws.name}
              </MenuItem>
            ))}
            {canCreateWorkspace && (
              <MenuItem
                icon={<Plus className="h-4 w-4" />}
                onClick={() => {
                  close();
                  setCreatingWs(true);
                }}
              >
                New workspace
              </MenuItem>
            )}

            <MenuDivider />
            <MenuLabel>Organizations</MenuLabel>
            {memberships.map((m) => (
              <MenuItem
                key={m.organization_id}
                active={m.organization_id === organizationId}
                icon={<Building2 className="h-4 w-4 text-graphite-500" />}
                onClick={() => {
                  switchOrganization(m.organization_id);
                  close();
                }}
                trailing={
                  m.organization_id === organizationId ? (
                    <Check className="h-4 w-4 text-persimmon-600" />
                  ) : (
                    <span className="font-mono text-[0.6rem] uppercase tracking-wider text-graphite-400">
                      {ROLE_LABEL[m.role]}
                    </span>
                  )
                }
              >
                {m.organization_name}
              </MenuItem>
            ))}
            <MenuItem
              icon={<Plus className="h-4 w-4" />}
              onClick={() => {
                close();
                setCreatingOrg(true);
              }}
            >
              New organization
            </MenuItem>
            <MenuDivider />
            <MenuItem
              icon={<Settings2 className="h-4 w-4" />}
              onClick={() => {
                close();
                navigate("/settings/workspaces");
              }}
            >
              Manage workspaces
            </MenuItem>
          </div>
        )}
      </Popover>

      <WorkspaceFormModal open={creatingWs} onClose={() => setCreatingWs(false)} onCreated={(ws) => switchWorkspace(ws.id)} />
      <CreateOrganizationModal open={creatingOrg} onClose={() => setCreatingOrg(false)} />
    </>
  );
}
