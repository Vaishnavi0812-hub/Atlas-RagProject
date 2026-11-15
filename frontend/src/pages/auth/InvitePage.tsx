import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Building2, Clock, ShieldCheck } from "lucide-react";
import { AuthLayout, FormError } from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/Button";
import { RoleBadge } from "@/components/ui/RoleBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { SESSION_KEY, useLogout, useSession } from "@/hooks/useSession";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { ROLE_DESCRIPTION } from "@/lib/roles";

const ORG_KEY = "atlas.activeOrg";

export function InvitePage() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const session = useSession();
  const logout = useLogout();

  const preview = useQuery({
    queryKey: ["invitation", token],
    queryFn: () => api.invitations.preview(token),
    retry: false,
  });

  const accept = useMutation({
    mutationFn: () => api.invitations.accept(token),
    onSuccess: async (membership) => {
      try {
        localStorage.setItem(ORG_KEY, membership.organization_id);
      } catch {
        /* ignore */
      }
      await qc.invalidateQueries({ queryKey: SESSION_KEY });
      toast({ title: `Welcome to ${membership.organization_name}` });
      navigate("/", { replace: true });
    },
  });

  const invite = preview.data;
  const user = session.data?.user;
  const next = encodeURIComponent(`/invite/${token}`);
  const emailParam = invite ? `&email=${encodeURIComponent(invite.email)}` : "";
  const wrongAccount = user && invite && user.email !== invite.email;

  return (
    <AuthLayout
      eyebrow="Invitation"
      title={invite ? <>Join {invite.organization_name}</> : "You’ve been invited"}
      description={
        invite?.invited_by_name
          ? `${invite.invited_by_name} invited you to collaborate in ATLAS.`
          : "Review the invitation below."
      }
    >
      {preview.isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}

      {preview.isError && (
        <div className="space-y-5">
          <FormError message={preview.error.message} />
          <Link to="/">
            <Button variant="secondary" className="w-full">
              Go to ATLAS
            </Button>
          </Link>
        </div>
      )}

      {invite && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
          <div className="space-y-3 rounded-xl bg-white/80 p-5 shadow-card ring-1 ring-graphite-900/[0.06]">
            <Row icon={Building2} label="Organization" value={invite.organization_name} />
            <Row icon={ShieldCheck} label="Role" value={<RoleBadge role={invite.role} />} />
            <Row icon={Clock} label="Expires" value={formatDate(invite.expires_at)} />
            <p className="border-t hairline pt-3 text-xs leading-relaxed text-graphite-500">
              {ROLE_DESCRIPTION[invite.role]}
            </p>
          </div>

          {invite.status !== "pending" ? (
            <FormError message={`This invitation has ${invite.status}. Ask an admin for a new link.`} />
          ) : !user ? (
            <div className="space-y-3">
              <p className="text-sm text-graphite-600">
                This invitation is for <span className="font-medium text-graphite-900">{invite.email}</span>.
              </p>
              <Link to={`/register?next=${next}${emailParam}`} className="block">
                <Button size="lg" className="w-full">
                  Create an account to join
                </Button>
              </Link>
              <Link to={`/login?next=${next}${emailParam}`} className="block">
                <Button size="lg" variant="secondary" className="w-full">
                  I already have an account
                </Button>
              </Link>
            </div>
          ) : wrongAccount ? (
            <div className="space-y-3">
              <FormError
                message={`You’re signed in as ${user.email}, but this invitation is for ${invite.email}.`}
              />
              <Button
                variant="secondary"
                className="w-full"
                loading={logout.isPending}
                onClick={() =>
                  logout.mutate(undefined, {
                    onSettled: () => navigate(`/login?next=${next}${emailParam}`),
                  })
                }
              >
                Sign in with a different account
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <FormError message={accept.error?.message ?? null} />
              <Button size="lg" className="w-full" loading={accept.isPending} onClick={() => accept.mutate()}>
                Accept and join {invite.organization_name}
              </Button>
            </div>
          )}
        </motion.div>
      )}
    </AuthLayout>
  );
}

function Row({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="flex items-center gap-2 text-graphite-500">
        <Icon className="h-4 w-4" strokeWidth={1.75} />
        {label}
      </span>
      <span className="font-medium text-graphite-900">{value}</span>
    </div>
  );
}
