import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api, type MeResponse } from "@/lib/api";

export const SESSION_KEY = ["session"] as const;

/** Current user + memberships, or `null` when signed out. */
export function useSession() {
  return useQuery<MeResponse | null>({
    queryKey: SESSION_KEY,
    queryFn: async () => {
      try {
        return await api.auth.me();
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 60_000,
    retry: false,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      api.auth.login(email, password),
    onSuccess: ({ user, memberships }) => {
      qc.clear();
      qc.setQueryData(SESSION_KEY, { user, memberships });
    },
  });
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { fullName: string; email: string; password: string }) =>
      api.auth.register(v.fullName, v.email, v.password),
    onSuccess: ({ user, memberships }) => {
      qc.clear();
      qc.setQueryData(SESSION_KEY, { user, memberships });
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.auth.logout().catch(() => undefined),
    onSettled: () => {
      // Drop every cached tenant query so nothing leaks into the next session.
      qc.clear();
      qc.setQueryData(SESSION_KEY, null);
    },
  });
}
