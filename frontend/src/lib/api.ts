/**
 * Typed client for the ATLAS API. Requests go through the Vite proxy
 * (`/api` → FastAPI), so the httpOnly session cookie is same-origin.
 */

export const API_BASE = "/api/v1";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public detail?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function messageFromDetail(detail: unknown, status: number): string {
  if (detail && typeof detail === "object" && "detail" in detail) {
    const d = (detail as { detail: unknown }).detail;
    if (typeof d === "string") return d;
    // FastAPI validation errors: [{ msg, loc, ... }]
    if (Array.isArray(d) && d.length && typeof d[0]?.msg === "string") {
      return String(d[0].msg).replace(/^Value error, /, "");
    }
  }
  if (status === 429) return "Too many attempts. Please wait a moment and try again.";
  if (status >= 500) return "The server ran into a problem. Please try again.";
  return `Request failed (${status})`;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "same-origin",
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    let detail: unknown;
    try {
      detail = await response.json();
    } catch {
      detail = undefined;
    }
    throw new ApiError(response.status, messageFromDetail(detail, response.status), detail);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

const json = (body: unknown) => JSON.stringify(body);

// ---------------------------------------------------------------- Types

export type Role = "owner" | "admin" | "editor" | "viewer";
export type WorkspaceVisibility = "organization" | "restricted";
export type WorkspaceColor = "persimmon" | "cobalt" | "gold" | "graphite" | "sand";

export type User = {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
  last_login_at: string | null;
};

export type Membership = {
  organization_id: string;
  organization_name: string;
  organization_slug: string;
  role: Role;
};

export type MeResponse = { user: User; memberships: Membership[] };
export type AuthResponse = MeResponse & { access_token: string; expires_at: string };

export type Organization = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  role: Role;
  member_count: number;
  workspace_count: number;
};

export type Member = {
  user_id: string;
  email: string;
  full_name: string;
  role: Role;
  joined_at: string;
  is_you: boolean;
};

export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export type Invitation = {
  id: string;
  email: string;
  role: Role;
  status: InvitationStatus;
  invited_by_name: string | null;
  created_at: string;
  expires_at: string;
};

export type InvitationCreated = Invitation & { invite_url: string; token: string };

export type InvitationPreview = {
  organization_name: string;
  email: string;
  role: Role;
  invited_by_name: string | null;
  status: InvitationStatus;
  expires_at: string;
};

export type Workspace = {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  description: string | null;
  visibility: WorkspaceVisibility;
  color: WorkspaceColor;
  created_at: string;
  role: Role;
  permissions: { can_view: boolean; can_edit: boolean; can_manage: boolean };
};

export type WorkspaceInput = {
  name: string;
  description?: string | null;
  visibility: WorkspaceVisibility;
  color: WorkspaceColor;
};

export type WorkspaceMember = {
  user_id: string;
  email: string;
  full_name: string;
  organization_role: Role;
  workspace_role: Role | null;
  effective_role: Role;
  access: "organization_admin" | "organization_wide" | "granted";
};

export type ActivityEvent = {
  id: string;
  action: string;
  summary: string;
  target_type: string | null;
  target_id: string | null;
  workspace_id: string | null;
  workspace_name: string | null;
  actor_id: string | null;
  actor_name: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

export type DependencyStatus = {
  name: "postgres" | "neo4j" | "qdrant" | "redis";
  status: "ok" | "error";
  latency_ms: number | null;
  detail: string | null;
};

export type HealthReport = {
  status: "ok" | "degraded";
  app: string;
  environment: string;
  dependencies: DependencyStatus[];
};

// ---------------------------------------------------------------- Endpoints

export const api = {
  health: () => apiFetch<HealthReport>("/health/dependencies"),

  auth: {
    me: () => apiFetch<MeResponse>("/auth/me"),
    login: (email: string, password: string) =>
      apiFetch<AuthResponse>("/auth/login", { method: "POST", body: json({ email, password }) }),
    register: (full_name: string, email: string, password: string) =>
      apiFetch<AuthResponse>("/auth/register", {
        method: "POST",
        body: json({ full_name, email, password }),
      }),
    logout: () => apiFetch<void>("/auth/logout", { method: "POST" }),
    updateProfile: (full_name: string) =>
      apiFetch<User>("/auth/me", { method: "PATCH", body: json({ full_name }) }),
    changePassword: (current_password: string, new_password: string) =>
      apiFetch<AuthResponse>("/auth/change-password", {
        method: "POST",
        body: json({ current_password, new_password }),
      }),
  },

  orgs: {
    list: () => apiFetch<Organization[]>("/organizations"),
    get: (id: string) => apiFetch<Organization>(`/organizations/${id}`),
    create: (name: string) =>
      apiFetch<Organization>("/organizations", { method: "POST", body: json({ name }) }),
    update: (id: string, name: string) =>
      apiFetch<Organization>(`/organizations/${id}`, { method: "PATCH", body: json({ name }) }),
    remove: (id: string) => apiFetch<void>(`/organizations/${id}`, { method: "DELETE" }),

    members: (id: string) => apiFetch<Member[]>(`/organizations/${id}/members`),
    updateMemberRole: (id: string, userId: string, role: Role) =>
      apiFetch<Member>(`/organizations/${id}/members/${userId}`, {
        method: "PATCH",
        body: json({ role }),
      }),
    removeMember: (id: string, userId: string) =>
      apiFetch<void>(`/organizations/${id}/members/${userId}`, { method: "DELETE" }),

    invitations: (id: string) => apiFetch<Invitation[]>(`/organizations/${id}/invitations`),
    invite: (id: string, email: string, role: Role) =>
      apiFetch<InvitationCreated>(`/organizations/${id}/invitations`, {
        method: "POST",
        body: json({ email, role }),
      }),
    regenerateInvitation: (id: string, invitationId: string) =>
      apiFetch<InvitationCreated>(`/organizations/${id}/invitations/${invitationId}/regenerate`, {
        method: "POST",
      }),
    revokeInvitation: (id: string, invitationId: string) =>
      apiFetch<void>(`/organizations/${id}/invitations/${invitationId}`, { method: "DELETE" }),

    activity: (id: string, params: { workspace_id?: string; before?: string; limit?: number } = {}) => {
      const qs = new URLSearchParams();
      if (params.workspace_id) qs.set("workspace_id", params.workspace_id);
      if (params.before) qs.set("before", params.before);
      if (params.limit) qs.set("limit", String(params.limit));
      const suffix = qs.toString() ? `?${qs}` : "";
      return apiFetch<ActivityEvent[]>(`/organizations/${id}/activity${suffix}`);
    },
  },

  workspaces: {
    list: (orgId: string) => apiFetch<Workspace[]>(`/organizations/${orgId}/workspaces`),
    create: (orgId: string, input: WorkspaceInput) =>
      apiFetch<Workspace>(`/organizations/${orgId}/workspaces`, {
        method: "POST",
        body: json(input),
      }),
    update: (orgId: string, wsId: string, input: Partial<WorkspaceInput>) =>
      apiFetch<Workspace>(`/organizations/${orgId}/workspaces/${wsId}`, {
        method: "PATCH",
        body: json(input),
      }),
    remove: (orgId: string, wsId: string) =>
      apiFetch<void>(`/organizations/${orgId}/workspaces/${wsId}`, { method: "DELETE" }),
    members: (orgId: string, wsId: string) =>
      apiFetch<WorkspaceMember[]>(`/organizations/${orgId}/workspaces/${wsId}/members`),
    grant: (orgId: string, wsId: string, userId: string, role: "editor" | "viewer") =>
      apiFetch<WorkspaceMember>(`/organizations/${orgId}/workspaces/${wsId}/members/${userId}`, {
        method: "PUT",
        body: json({ role }),
      }),
    revoke: (orgId: string, wsId: string, userId: string) =>
      apiFetch<void>(`/organizations/${orgId}/workspaces/${wsId}/members/${userId}`, {
        method: "DELETE",
      }),
  },

  invitations: {
    preview: (token: string) => apiFetch<InvitationPreview>(`/invitations/${token}`),
    accept: (token: string) =>
      apiFetch<Membership>(`/invitations/${token}/accept`, { method: "POST" }),
  },
};
