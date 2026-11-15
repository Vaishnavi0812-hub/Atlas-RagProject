import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, Link2, MailPlus, RefreshCw, Trash2, UserMinus } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select, TextField } from "@/components/ui/Field";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { RoleBadge } from "@/components/ui/RoleBadge";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { FormError } from "@/components/auth/AuthLayout";
import { tenantKeys, useTenant } from "@/context/TenantContext";
import { api, type InvitationCreated, type Member, type Role } from "@/lib/api";
import { formatDate, timeAgo } from "@/lib/format";
import { ROLE_LABEL, ROLE_RANK, assignableRoles, hasRole } from "@/lib/roles";
import { SettingsSection } from "./SettingsLayout";

export function MembersSettings() {
  const { organization } = useTenant();
  const orgId = organization?.id;
  const qc = useQueryClient();
  const toast = useToast();
  const myRole: Role = organization?.role ?? "viewer";
  const isAdmin = hasRole(myRole, "admin");

  const members = useQuery({
    queryKey: tenantKeys.members(orgId ?? "none"),
    queryFn: () => api.orgs.members(orgId!),
    enabled: !!orgId,
  });
  const invitations = useQuery({
    queryKey: tenantKeys.invitations(orgId ?? "none"),
    queryFn: () => api.orgs.invitations(orgId!),
    enabled: !!orgId && isAdmin,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: tenantKeys.members(orgId!) });
    qc.invalidateQueries({ queryKey: tenantKeys.invitations(orgId!) });
    qc.invalidateQueries({ queryKey: tenantKeys.org(orgId!) });
    qc.invalidateQueries({ queryKey: tenantKeys.activityRoot(orgId!) });
  };

  // ---- Invite
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("viewer");
  const [created, setCreated] = useState<InvitationCreated | null>(null);
  const invite = useMutation({
    mutationFn: () => api.orgs.invite(orgId!, email, role),
    onSuccess: (inv) => {
      setEmail("");
      setCreated(inv);
      refresh();
    },
  });
  const regenerate = useMutation({
    mutationFn: (id: string) => api.orgs.regenerateInvitation(orgId!, id),
    onSuccess: (inv) => {
      setCreated(inv);
      refresh();
    },
    onError: (e: Error) => toast({ title: "Couldn’t create a new link", description: e.message, tone: "error" }),
  });
  const revokeInvite = useMutation({
    mutationFn: (id: string) => api.orgs.revokeInvitation(orgId!, id),
    onSuccess: () => {
      refresh();
      toast({ title: "Invitation revoked" });
    },
  });

  // ---- Members
  const changeRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Role }) => api.orgs.updateMemberRole(orgId!, userId, role),
    onSuccess: (m) => {
      refresh();
      toast({ title: `${m.full_name} is now ${ROLE_LABEL[m.role].toLowerCase()}` });
    },
    onError: (e: Error) => toast({ title: "Couldn’t change role", description: e.message, tone: "error" }),
  });
  const [removing, setRemoving] = useState<Member | null>(null);
  const removeMember = useMutation({
    mutationFn: (userId: string) => api.orgs.removeMember(orgId!, userId),
    onSuccess: () => {
      toast({ title: `${removing?.full_name} was removed` });
      setRemoving(null);
      refresh();
    },
    onError: (e: Error) => toast({ title: "Couldn’t remove member", description: e.message, tone: "error" }),
  });

  const canManage = (m: Member) => isAdmin && !m.is_you && ROLE_RANK[myRole] >= ROLE_RANK[m.role];
  const submitInvite = (e: FormEvent) => {
    e.preventDefault();
    if (email) invite.mutate();
  };
  const pending = invitations.data?.filter((i) => i.status === "pending") ?? [];

  return (
    <div>
      {isAdmin && (
        <SettingsSection
          title="Invite people"
          description="Invitations create a single-use link bound to the invitee’s email address. Share it with them directly."
        >
          <Card className="p-6">
            <form onSubmit={submitInvite} className="space-y-4">
              <FormError message={invite.error?.message ?? null} />
              <div className="grid gap-3 sm:grid-cols-[1fr_160px_auto] sm:items-end">
                <TextField
                  label="Email address"
                  type="email"
                  placeholder="colleague@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <Select label="Role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                  {assignableRoles(myRole).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </Select>
                <Button type="submit" className="h-11" loading={invite.isPending} disabled={!email} icon={<MailPlus className="h-4 w-4" />}>
                  Create invite
                </Button>
              </div>
            </form>
          </Card>
        </SettingsSection>
      )}

      <SettingsSection
        title="Members"
        description={
          isAdmin
            ? "Change roles or remove people. You can only manage members at or below your own role."
            : "Everyone in this organization."
        }
      >
        <Card className="overflow-hidden">
          <ul className="divide-y divide-graphite-900/[0.06]">
            {members.isLoading &&
              Array.from({ length: 3 }).map((_, i) => (
                <li key={i} className="flex items-center gap-3 px-5 py-4">
                  <Skeleton className="h-9 w-9 rounded-full" />
                  <Skeleton className="h-4 w-48" />
                </li>
              ))}
            <AnimatePresence initial={false}>
              {members.data?.map((m) => (
                <motion.li
                  key={m.user_id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex flex-wrap items-center gap-3 px-5 py-4 transition-colors hover:bg-sand-50/80"
                >
                  <Avatar name={m.full_name} seed={m.user_id} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-sm font-medium">
                      {m.full_name}
                      {m.is_you && <Badge>You</Badge>}
                    </p>
                    <p className="truncate text-xs text-graphite-500">
                      {m.email} · joined {formatDate(m.joined_at)}
                    </p>
                  </div>
                  {canManage(m) ? (
                    <div className="flex items-center gap-1.5">
                      <Select
                        size="sm"
                        className="w-28"
                        value={m.role}
                        aria-label={`Role for ${m.full_name}`}
                        onChange={(e) => changeRole.mutate({ userId: m.user_id, role: e.target.value as Role })}
                      >
                        {assignableRoles(myRole).map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </Select>
                      <button
                        onClick={() => setRemoving(m)}
                        className="rounded-md p-1.5 text-graphite-400 transition-colors hover:bg-red-50 hover:text-red-600"
                        aria-label={`Remove ${m.full_name}`}
                      >
                        <UserMinus className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <RoleBadge role={m.role} />
                  )}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </Card>
      </SettingsSection>

      {isAdmin && (
        <SettingsSection
          title="Pending invitations"
          description="Links expire after 7 days. Generating a new link disables the previous one."
        >
          {invitations.isLoading ? (
            <Skeleton className="h-20 w-full rounded-2xl" />
          ) : pending.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-graphite-900/15 px-5 py-8 text-center text-sm text-graphite-500">
              No pending invitations.
            </div>
          ) : (
            <Card className="overflow-hidden">
              <ul className="divide-y divide-graphite-900/[0.06]">
                {pending.map((inv) => (
                  <li key={inv.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sand-200 text-graphite-600">
                      <Link2 className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{inv.email}</p>
                      <p className="truncate text-xs text-graphite-500">
                        Invited {timeAgo(inv.created_at)}
                        {inv.invited_by_name && ` by ${inv.invited_by_name}`} · expires {formatDate(inv.expires_at)}
                      </p>
                    </div>
                    <RoleBadge role={inv.role} />
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<RefreshCw className="h-3.5 w-3.5" />}
                      loading={regenerate.isPending && regenerate.variables === inv.id}
                      onClick={() => regenerate.mutate(inv.id)}
                    >
                      New link
                    </Button>
                    <button
                      onClick={() => revokeInvite.mutate(inv.id)}
                      className="rounded-md p-1.5 text-graphite-400 transition-colors hover:bg-red-50 hover:text-red-600"
                      aria-label={`Revoke invitation for ${inv.email}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </SettingsSection>
      )}

      <InviteLinkModal invitation={created} onClose={() => setCreated(null)} />
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && removeMember.mutate(removing.user_id)}
        loading={removeMember.isPending}
        title={`Remove ${removing?.full_name}?`}
        description="They will immediately lose access to every workspace in this organization."
        confirmLabel="Remove member"
      />
    </div>
  );
}

function InviteLinkModal({ invitation, onClose }: { invitation: InvitationCreated | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!invitation) return;
    try {
      await navigator.clipboard.writeText(invitation.invite_url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the link remains selectable */
    }
  };

  return (
    <Modal
      open={!!invitation}
      onClose={onClose}
      size="md"
      title="Invitation link ready"
      description={
        invitation && (
          <>
            Send this link to <strong className="text-graphite-900">{invitation.email}</strong>. It only works for that
            email address and expires on {formatDate(invitation.expires_at)}.
          </>
        )
      }
      footer={<Button onClick={onClose}>Done</Button>}
    >
      {invitation && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-xl bg-graphite-900 p-2 pl-4 text-sand-100">
            <code className="min-w-0 flex-1 select-all truncate font-mono text-xs">{invitation.invite_url}</code>
            <Button size="sm" variant={copied ? "secondary" : "primary"} onClick={copy} icon={copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}>
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="text-xs text-graphite-500">
            For security, this link is shown only once. You can generate a new one from Pending invitations.
          </p>
        </div>
      )}
    </Modal>
  );
}
