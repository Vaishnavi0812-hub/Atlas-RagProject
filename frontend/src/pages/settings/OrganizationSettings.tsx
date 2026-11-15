import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { RoleBadge } from "@/components/ui/RoleBadge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { FormError } from "@/components/auth/AuthLayout";
import { SESSION_KEY, useSession } from "@/hooks/useSession";
import { tenantKeys, useTenant } from "@/context/TenantContext";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { ROLE_DESCRIPTION, hasRole } from "@/lib/roles";
import { staggerContainer } from "@/lib/motion";
import { SettingsSection } from "./SettingsLayout";

export function OrganizationSettings() {
  const { organization, memberships } = useTenant();
  const session = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  useEffect(() => {
    if (organization) setName(organization.name);
  }, [organization]);

  const afterExit = async () => {
    await qc.invalidateQueries({ queryKey: SESSION_KEY });
    navigate("/", { replace: true });
  };

  const rename = useMutation({
    mutationFn: () => api.orgs.update(organization!.id, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tenantKeys.org(organization!.id) });
      qc.invalidateQueries({ queryKey: SESSION_KEY });
      toast({ title: "Organization renamed" });
    },
  });

  const remove = useMutation({
    mutationFn: () => api.orgs.remove(organization!.id),
    onSuccess: async () => {
      toast({ title: `${organization!.name} was deleted` });
      setConfirmDelete(false);
      await afterExit();
    },
    onError: (e: Error) => toast({ title: "Couldn’t delete organization", description: e.message, tone: "error" }),
  });

  const leave = useMutation({
    mutationFn: () => api.orgs.removeMember(organization!.id, session.data!.user.id),
    onSuccess: async () => {
      toast({ title: `You left ${organization!.name}` });
      setConfirmLeave(false);
      await afterExit();
    },
    onError: (e: Error) => {
      setConfirmLeave(false);
      toast({ title: "Couldn’t leave organization", description: e.message, tone: "error" });
    },
  });

  if (!organization) return <Skeleton className="h-64 w-full rounded-2xl" />;

  const canEdit = hasRole(organization.role, "admin");
  const isOwner = organization.role === "owner";
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (canEdit && name.trim().length >= 2 && name !== organization.name) rename.mutate();
  };

  return (
    <div>
      <SettingsSection title="Overview" description="A snapshot of this organization.">
        <motion.div variants={staggerContainer} initial="initial" animate="animate" className="grid gap-4 sm:grid-cols-3">
          <Stat label="Your role" value={<RoleBadge role={organization.role} />} note={ROLE_DESCRIPTION[organization.role]} />
          <Stat label="Members" value={organization.member_count} />
          <Stat label="Workspaces" value={organization.workspace_count} note={`Created ${formatDate(organization.created_at)}`} />
        </motion.div>
      </SettingsSection>

      <SettingsSection title="Details" description={canEdit ? "Visible to every member." : "Only admins can change these details."}>
        <Card className="p-6">
          <form onSubmit={submit} className="space-y-4">
            <FormError message={rename.error?.message ?? null} />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Organization name" value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} />
              <TextField label="Identifier" value={organization.slug} disabled hint="Generated from the name at creation." />
            </div>
            {canEdit && (
              <div className="flex justify-end">
                <Button type="submit" loading={rename.isPending} disabled={name.trim().length < 2 || name === organization.name}>
                  Save
                </Button>
              </div>
            )}
          </form>
        </Card>
      </SettingsSection>

      <SettingsSection title="Danger zone" description="These actions can’t be undone.">
        <Card className="divide-y divide-graphite-900/[0.06] ring-red-200">
          <DangerRow
            title="Leave organization"
            body={
              memberships.length > 1
                ? "You’ll lose access to its workspaces until someone invites you again."
                : "This is your only organization. Leaving it takes you back to setup."
            }
            action={
              <Button variant="secondary" onClick={() => setConfirmLeave(true)}>
                Leave
              </Button>
            }
          />
          {isOwner && (
            <DangerRow
              title="Delete organization"
              body="Permanently removes every workspace, document, vector and knowledge-graph node in this organization."
              action={
                <Button className="bg-red-600 text-white hover:bg-red-700" onClick={() => setConfirmDelete(true)}>
                  Delete
                </Button>
              }
            />
          )}
        </Card>
      </SettingsSection>

      <ConfirmDialog
        open={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        onConfirm={() => leave.mutate()}
        loading={leave.isPending}
        title={`Leave ${organization.name}?`}
        description="You’ll immediately lose access to its workspaces, documents and conversations."
        confirmLabel="Leave organization"
      />
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => remove.mutate()}
        loading={remove.isPending}
        title="Delete organization"
        description={
          <>
            This permanently deletes <strong>{organization.name}</strong>, its {organization.workspace_count}{" "}
            workspace{organization.workspace_count === 1 ? "" : "s"}, and all associated vectors and graph data for
            every member.
          </>
        }
        confirmText={organization.name}
        confirmLabel="Delete permanently"
      />
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return (
    <Card className="p-5">
      <p className="eyebrow">{label}</p>
      <div className="mt-3 font-display text-3xl tabular-nums">{value}</div>
      {note && <p className="mt-2 text-xs leading-relaxed text-graphite-500">{note}</p>}
    </Card>
  );
}

function DangerRow({ title, body, action }: { title: string; body: string; action: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-sm text-graphite-600">{body}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}
