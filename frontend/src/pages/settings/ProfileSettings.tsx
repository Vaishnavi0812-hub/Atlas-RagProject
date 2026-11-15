import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Avatar } from "@/components/ui/Avatar";
import { PasswordStrength, isPasswordValid } from "@/components/ui/PasswordStrength";
import { useToast } from "@/components/ui/Toast";
import { FormError } from "@/components/auth/AuthLayout";
import { SESSION_KEY, useSession } from "@/hooks/useSession";
import { api } from "@/lib/api";
import { formatDate, timeAgo } from "@/lib/format";
import { SettingsSection } from "./SettingsLayout";

export function ProfileSettings() {
  const { data } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const user = data!.user;

  const [name, setName] = useState(user.full_name);
  useEffect(() => setName(user.full_name), [user.full_name]);

  const saveProfile = useMutation({
    mutationFn: () => api.auth.updateProfile(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SESSION_KEY });
      toast({ title: "Profile updated" });
    },
  });

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const changePassword = useMutation({
    mutationFn: () => api.auth.changePassword(current, next),
    onSuccess: () => {
      setCurrent("");
      setNext("");
      setConfirm("");
      toast({ title: "Password changed", description: "Other sessions have been signed out." });
    },
  });

  const submitProfile = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim() && name !== user.full_name) saveProfile.mutate();
  };
  const submitPassword = (e: FormEvent) => {
    e.preventDefault();
    if (current && isPasswordValid(next) && next === confirm) changePassword.mutate();
  };

  return (
    <div>
      <SettingsSection title="Profile" description="How you appear to colleagues across every organization.">
        <Card className="p-6">
          <div className="mb-6 flex items-center gap-4">
            <Avatar name={user.full_name} seed={user.id} size="lg" />
            <div>
              <p className="font-display text-lg leading-tight">{user.full_name}</p>
              <p className="text-sm text-graphite-500">{user.email}</p>
              <p className="mt-1 font-mono text-[0.65rem] uppercase tracking-wider text-graphite-400">
                Member since {formatDate(user.created_at)}
                {user.last_login_at && ` · Last sign-in ${timeAgo(user.last_login_at)}`}
              </p>
            </div>
          </div>
          <form onSubmit={submitProfile} className="space-y-4">
            <FormError message={saveProfile.error?.message ?? null} />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Full name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
              <TextField label="Email" value={user.email} disabled hint="Email is your sign-in identity." />
            </div>
            <div className="flex justify-end">
              <Button type="submit" loading={saveProfile.isPending} disabled={!name.trim() || name === user.full_name}>
                Save profile
              </Button>
            </div>
          </form>
        </Card>
      </SettingsSection>

      <SettingsSection
        title="Password"
        description="Changing your password signs you out everywhere else. This session stays signed in."
      >
        <Card className="p-6">
          <form onSubmit={submitPassword} className="space-y-4">
            <FormError message={changePassword.error?.message ?? null} />
            <TextField
              label="Current password"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="New password"
                type="password"
                autoComplete="new-password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
              <TextField
                label="Confirm new password"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                error={confirm && confirm !== next ? "Passwords don’t match." : null}
              />
            </div>
            {next && <PasswordStrength password={next} />}
            <div className="flex justify-end">
              <Button
                type="submit"
                variant="dark"
                loading={changePassword.isPending}
                disabled={!current || !isPasswordValid(next) || next !== confirm}
              >
                Change password
              </Button>
            </div>
          </form>
        </Card>
      </SettingsSection>
    </div>
  );
}
