import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useSession } from "@/hooks/useSession";
import { FullScreenLoader } from "@/components/ui/FullScreenLoader";
import { safeNext } from "@/lib/navigation";

/** Signed-in users only; users without an organization go to onboarding. */
export function RequireAuth({ children, allowNoOrg = false }: { children: ReactNode; allowNoOrg?: boolean }) {
  const session = useSession();
  const location = useLocation();

  if (session.isLoading) return <FullScreenLoader />;
  if (!session.data) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  if (!allowNoOrg && session.data.memberships.length === 0) {
    return <Navigate to="/onboarding" replace />;
  }
  return <>{children}</>;
}

/** Login/register: bounce signed-in users onward. */
export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const session = useSession();
  const location = useLocation();
  if (session.isLoading) return <FullScreenLoader />;
  if (session.data) {
    return <Navigate to={safeNext(new URLSearchParams(location.search).get("next"))} replace />;
  }
  return <>{children}</>;
}
