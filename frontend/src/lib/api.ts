/**
 * Thin fetch wrapper for the ATLAS API. All requests go through the Vite
 * proxy (`/api` → FastAPI) in development.
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

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    let detail: unknown;
    try {
      detail = await response.json();
    } catch {
      detail = await response.text().catch(() => undefined);
    }
    const message =
      (detail && typeof detail === "object" && "detail" in detail
        ? String((detail as { detail: unknown }).detail)
        : null) ?? `Request failed with status ${response.status}`;
    throw new ApiError(response.status, message, detail);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

// ---- Health ----

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

export const getHealth = () => apiFetch<HealthReport>("/health/dependencies");
