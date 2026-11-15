import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { AuthLayout, FormError } from "@/components/auth/AuthLayout";
import { TextField } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { PasswordStrength, isPasswordValid } from "@/components/ui/PasswordStrength";
import { useRegister } from "@/hooks/useSession";
import { safeNext } from "@/lib/navigation";

export function RegisterPage() {
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const navigate = useNavigate();
  const register = useRegister();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState(false);

  const mismatch = touched && confirm.length > 0 && confirm !== password;
  const canSubmit = fullName.trim() && email && isPasswordValid(password) && confirm === password;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!canSubmit) return;
    register.mutate(
      { fullName, email, password },
      { onSuccess: () => navigate(next, { replace: true }) },
    );
  };

  return (
    <AuthLayout
      eyebrow="Get started"
      title="Create your account"
      description="Create your account, then start an organization or accept an invitation from your team."
      footer={
        <>
          Already have an account?{" "}
          <Link
            to={`/login${params.toString() ? `?${params}` : ""}`}
            className="font-medium text-graphite-900 underline decoration-persimmon-500 decoration-2 underline-offset-4 hover:text-persimmon-600"
          >
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5" noValidate>
        <FormError message={register.error?.message ?? null} />
        <TextField
          label="Full name"
          autoComplete="name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Jordan Avery"
          required
        />
        <TextField
          label="Work email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          required
        />
        <div className="space-y-3">
          <TextField
            label="Password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <PasswordStrength password={password} />
        </div>
        <TextField
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          onBlur={() => setTouched(true)}
          error={mismatch ? "Passwords don’t match." : null}
          required
        />
        <Button type="submit" size="lg" className="w-full" loading={register.isPending} disabled={!canSubmit}>
          Create account <ArrowRight className="h-4 w-4" />
        </Button>
      </form>
    </AuthLayout>
  );
}
