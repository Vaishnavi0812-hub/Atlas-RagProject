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

export type WorkspaceSettings = {
  chunk_size: number;
  chunk_overlap: number;
  viewers_can_download: boolean;
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
  settings: WorkspaceSettings;
};

export type WorkspaceInput = {
  name: string;
  description?: string | null;
  visibility: WorkspaceVisibility;
  color: WorkspaceColor;
  settings?: WorkspaceSettings;
};

// ---- Documents

export type DocumentStatus = "queued" | "processing" | "completed" | "failed";
export type FileType = "pdf" | "docx" | "txt" | "markdown";

export type DocumentItem = {
  id: string;
  workspace_id: string;
  filename: string;
  file_type: FileType;
  content_type: string;
  size_bytes: number;
  status: DocumentStatus;
  stage: string;
  stage_label: string;
  progress: number;
  error: string | null;
  page_count: number | null;
  char_count: number | null;
  word_count: number | null;
  chunk_count: number;
  entity_count: number;
  relationship_count: number;
  uploaded_by_name: string | null;
  created_at: string;
  processing_started_at: string | null;
  processing_completed_at: string | null;
  processing_ms: number | null;
  metadata: Record<string, unknown> & { title?: string; author?: string; headings?: string[] };
};

export type ProcessingEvent = {
  stage: string;
  label: string;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  detail: string | null;
};

export type ProcessingJob = {
  id: string;
  kind: "ingest" | "reprocess" | "retry";
  status: "queued" | "running" | "completed" | "failed";
  attempt: number;
  stage: string;
  progress: number;
  error: string | null;
  events: ProcessingEvent[];
  settings_snapshot: { chunk_size?: number; chunk_overlap?: number };
  triggered_by_name: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
};

export type DocumentDetail = DocumentItem & {
  content_hash: string;
  embedding_model: string | null;
  jobs: ProcessingJob[];
  can_download: boolean;
};

export type Chunk = {
  id: string;
  chunk_index: number;
  page_number: number | null;
  page_end: number | null;
  char_start: number;
  char_end: number;
  token_estimate: number;
  content: string;
};

export type ChunkPage = { items: Chunk[]; total: number; offset: number; limit: number };

export type UploadResult = {
  documents: DocumentItem[];
  errors: { filename: string; error: string; existing_document_id: string | null }[];
};

export type DocumentStats = {
  total: number;
  completed: number;
  in_progress: number;
  failed: number;
  chunks: number;
  entities: number;
  relationships: number;
  size_bytes: number;
  graph_extraction_enabled: boolean;
};

export type DocumentFilters = { q?: string; status?: string; file_type?: string };

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

  documents: {
    base: (orgId: string, wsId: string) => `/organizations/${orgId}/workspaces/${wsId}/documents`,
    list: (orgId: string, wsId: string, filters: DocumentFilters = {}) => {
      const qs = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => v && qs.set(k, v));
      const suffix = qs.toString() ? `?${qs}` : "";
      return apiFetch<DocumentItem[]>(`${api.documents.base(orgId, wsId)}${suffix}`);
    },
    stats: (orgId: string, wsId: string) =>
      apiFetch<DocumentStats>(`${api.documents.base(orgId, wsId)}/stats`),
    get: (orgId: string, wsId: string, docId: string) =>
      apiFetch<DocumentDetail>(`${api.documents.base(orgId, wsId)}/${docId}`),
    chunks: (orgId: string, wsId: string, docId: string, offset = 0, limit = 50) =>
      apiFetch<ChunkPage>(`${api.documents.base(orgId, wsId)}/${docId}/chunks?offset=${offset}&limit=${limit}`),
    reprocess: (orgId: string, wsId: string, docId: string) =>
      apiFetch<DocumentItem>(`${api.documents.base(orgId, wsId)}/${docId}/reprocess`, { method: "POST" }),
    remove: (orgId: string, wsId: string, docId: string) =>
      apiFetch<void>(`${api.documents.base(orgId, wsId)}/${docId}`, { method: "DELETE" }),
    fileUrl: (orgId: string, wsId: string, docId: string) =>
      `${API_BASE}${api.documents.base(orgId, wsId)}/${docId}/file`,
    downloadUrl: (orgId: string, wsId: string, docId: string) =>
      `${API_BASE}${api.documents.base(orgId, wsId)}/${docId}/download`,
  },
};

/**
 * Upload one file with progress reporting. fetch() can't report upload
 * progress, so this uses XMLHttpRequest.
 */
export function uploadDocument(
  orgId: string,
  wsId: string,
  file: File,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}${api.documents.base(orgId, wsId)}`);
    xhr.withCredentials = true;
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response as UploadResult);
      else reject(new ApiError(xhr.status, messageFromDetail(xhr.response, xhr.status), xhr.response));
    };
    xhr.onerror = () => reject(new ApiError(0, "Network error during upload."));
    xhr.onabort = () => reject(new ApiError(0, "Upload cancelled."));
    signal?.addEventListener("abort", () => xhr.abort());
    const form = new FormData();
    form.append("files", file);
    xhr.send(form);
  });
}
