import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Mail } from "lucide-react";
import { AuthLayout, FormError } from "@/components/auth/AuthLayout";
import { TextField } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { SESSION_KEY, useLogout, useSession } from "@/hooks/useSession";
import { api } from "@/lib/api";

export function OnboardingPage() {
  const session = useSession();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const logout = useLogout();
  const [name, setName] = useState("");

  const create = useMutation({
    mutationFn: () => api.orgs.create(name),
    onSuccess: async (org) => {
      try {
        localStorage.setItem("atlas.activeOrg", org.id);
      } catch {
        /* ignore */
      }
      await qc.invalidateQueries({ queryKey: SESSION_KEY });
      navigate("/", { replace: true });
    },
  });

  if (session.data && session.data.memberships.length > 0) return <Navigate to="/" replace />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length >= 2) create.mutate();
  };

  const firstName = session.data?.user.full_name.split(" ")[0];

  return (
    <AuthLayout
      eyebrow="Set up"
      title={firstName ? `Welcome, ${firstName}` : "Welcome"}
      description="Create an organization for your team. You’ll be its owner, and we’ll create a General workspace to start in."
      footer={
        <div className="space-y-4">
          <div className="flex gap-3 rounded-xl bg-white/60 p-4 ring-1 ring-graphite-900/[0.06]">
            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-cobalt-500" />
            <p className="text-xs leading-relaxed">
              Joining an existing team? Open the invitation link your admin sent to{" "}
              <span className="font-medium text-graphite-900">{session.data?.user.email}</span>.
            </p>
          </div>
          <button
            onClick={() => logout.mutate(undefined, { onSettled: () => navigate("/login") })}
            className="text-xs text-graphite-500 underline-offset-4 hover:text-graphite-800 hover:underline"
          >
            Sign out
          </button>
        </div>
      }
    >
      <form onSubmit={submit} className="space-y-5">
        <FormError message={create.error?.message ?? null} />
        <TextField
          label="Organization name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Northwind Logistics"
          hint="You can rename it later."
          autoFocus
        />
        <Button type="submit" size="lg" className="w-full" loading={create.isPending} disabled={name.trim().length < 2}>
          Create organization <ArrowRight className="h-4 w-4" />
        </Button>
      </form>
    </AuthLayout>
  );
}
