import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { AuthLayout, FormError } from "@/components/auth/AuthLayout";
import { TextField } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { useLogin } from "@/hooks/useSession";
import { safeNext } from "@/lib/navigation";

export function LoginPage() {
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const navigate = useNavigate();
  const login = useLogin();
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [password, setPassword] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate({ email, password }, { onSuccess: () => navigate(next, { replace: true }) });
  };

  return (
    <AuthLayout
      eyebrow="Welcome back"
      title="Sign in to ATLAS"
      description="Pick up where you left off across your organizations and workspaces."
      footer={
        <>
          New to ATLAS?{" "}
          <Link
            to={`/register${params.toString() ? `?${params}` : ""}`}
            className="font-medium text-graphite-900 underline decoration-persimmon-500 decoration-2 underline-offset-4 hover:text-persimmon-600"
          >
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5" noValidate>
        <FormError message={login.error?.message ?? null} />
        <TextField
          label="Work email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          required
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <Button
          type="submit"
          size="lg"
          className="w-full"
          loading={login.isPending}
          disabled={!email || !password}
        >
          Sign in <ArrowRight className="h-4 w-4" />
        </Button>
      </form>
    </AuthLayout>
  );
}
