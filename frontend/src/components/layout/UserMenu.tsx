import { useNavigate } from "react-router-dom";
import { LogOut, Settings, UserRound } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { MenuDivider, MenuItem, Popover } from "@/components/ui/Popover";
import { RoleBadge } from "@/components/ui/RoleBadge";
import { useLogout, useSession } from "@/hooks/useSession";
import { useTenant } from "@/context/TenantContext";

export function UserMenu() {
  const { data } = useSession();
  const { organization } = useTenant();
  const logout = useLogout();
  const navigate = useNavigate();
  if (!data) return null;
  const { user } = data;

  return (
    <Popover
      align="end"
      panelClassName="w-64"
      trigger={({ open, toggle }) => (
        <button
          onClick={toggle}
          aria-expanded={open}
          aria-label="Account menu"
          className="rounded-full ring-offset-2 ring-offset-sand-100 transition-shadow hover:ring-2 hover:ring-graphite-900/10"
        >
          <Avatar name={user.full_name} seed={user.id} size="sm" />
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="flex items-center gap-3 px-2.5 pb-2 pt-1.5">
            <Avatar name={user.full_name} seed={user.id} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{user.full_name}</p>
              <p className="truncate text-xs text-graphite-500">{user.email}</p>
            </div>
          </div>
          {organization && (
            <div className="mx-2.5 mb-1 flex items-center justify-between rounded-lg bg-sand-100 px-2.5 py-1.5 text-xs text-graphite-600">
              <span className="truncate">{organization.name}</span>
              <RoleBadge role={organization.role} />
            </div>
          )}
          <MenuDivider />
          <MenuItem
            icon={<UserRound className="h-4 w-4" />}
            onClick={() => {
              close();
              navigate("/settings/profile");
            }}
          >
            Profile
          </MenuItem>
          <MenuItem
            icon={<Settings className="h-4 w-4" />}
            onClick={() => {
              close();
              navigate("/settings/organization");
            }}
          >
            Organization settings
          </MenuItem>
          <MenuDivider />
          <MenuItem
            icon={<LogOut className="h-4 w-4" />}
            onClick={() => logout.mutate(undefined, { onSettled: () => navigate("/login", { replace: true }) })}
          >
            Sign out
          </MenuItem>
        </>
      )}
    </Popover>
  );
}
