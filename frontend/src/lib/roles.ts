import type { Role, WorkspaceColor } from "./api";

export const ROLE_RANK: Record<Role, number> = { viewer: 1, editor: 2, admin: 3, owner: 4 };

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  owner: "Full control, including billing-level actions and deleting the organization.",
  admin: "Manage members, invitations and every workspace.",
  editor: "Upload and process documents, ask questions, run evaluations.",
  viewer: "Read documents, explore the graph and ask questions.",
};

export const ROLES: Role[] = ["owner", "admin", "editor", "viewer"];

export const hasRole = (actual: Role, minimum: Role) => ROLE_RANK[actual] >= ROLE_RANK[minimum];

/** Roles `actor` may assign — never above their own. */
export const assignableRoles = (actor: Role) => ROLES.filter((r) => ROLE_RANK[r] <= ROLE_RANK[actor]);

export const WORKSPACE_COLORS: Record<WorkspaceColor, { label: string; hex: string; text: string }> = {
  persimmon: { label: "Persimmon", hex: "#FF7849", text: "#202124" },
  cobalt: { label: "Cobalt", hex: "#4776D0", text: "#FFFFFF" },
  gold: { label: "Gold", hex: "#D6AD64", text: "#202124" },
  graphite: { label: "Graphite", hex: "#202124", text: "#F4EFE6" },
  sand: { label: "Sand", hex: "#DACFBC", text: "#202124" },
};
