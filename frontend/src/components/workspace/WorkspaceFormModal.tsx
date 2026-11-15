import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Globe2, Lock } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { TextArea, TextField } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { FormError } from "@/components/auth/AuthLayout";
import { api, type Workspace, type WorkspaceColor, type WorkspaceVisibility } from "@/lib/api";
import { WORKSPACE_COLORS } from "@/lib/roles";
import { tenantKeys, useTenant } from "@/context/TenantContext";
import { cn } from "@/lib/cn";

/** Create a workspace, or edit one when `workspace` is given. */
export function WorkspaceFormModal({
  open,
  onClose,
  workspace,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  workspace?: Workspace;
  onCreated?: (ws: Workspace) => void;
}) {
  const { organizationId } = useTenant();
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<WorkspaceVisibility>("organization");
  const [color, setColor] = useState<WorkspaceColor>("persimmon");

  useEffect(() => {
    if (!open) return;
    setName(workspace?.name ?? "");
    setDescription(workspace?.description ?? "");
    setVisibility(workspace?.visibility ?? "organization");
    setColor(workspace?.color ?? "persimmon");
  }, [open, workspace]);

  const save = useMutation({
    mutationFn: () => {
      const input = { name, description: description || null, visibility, color };
      return workspace
        ? api.workspaces.update(organizationId!, workspace.id, input)
        : api.workspaces.create(organizationId!, input);
    },
    onSuccess: (ws) => {
      qc.invalidateQueries({ queryKey: tenantKeys.workspaces(organizationId!) });
      qc.invalidateQueries({ queryKey: tenantKeys.org(organizationId!) });
      toast({ title: workspace ? "Workspace updated" : `Created ${ws.name}` });
      if (!workspace) onCreated?.(ws);
      onClose();
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length >= 2) save.mutate();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={workspace ? "Edit workspace" : "New workspace"}
      description={
        workspace
          ? undefined
          : "Workspaces hold their own documents, knowledge graph and conversations."
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={name.trim().length < 2}>
            {workspace ? "Save changes" : "Create workspace"}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5">
        <FormError message={save.error?.message ?? null} />
        <TextField
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Vendor Management"
          maxLength={120}
        />
        <TextArea
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Supplier contracts, SLAs and dependency analysis."
          maxLength={1000}
          rows={3}
        />

        <fieldset>
          <legend className="text-[0.8rem] font-medium text-graphite-800">Access</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {(
              [
                { value: "organization", icon: Globe2, title: "Organization", body: "Every member can open it with their organization role." },
                { value: "restricted", icon: Lock, title: "Restricted", body: "Only admins and people you grant access to." },
              ] as const
            ).map((opt) => (
              <button
                type="button"
                key={opt.value}
                onClick={() => setVisibility(opt.value)}
                aria-pressed={visibility === opt.value}
                className={cn(
                  "rounded-xl p-3.5 text-left ring-1 transition-all duration-200",
                  visibility === opt.value
                    ? "bg-white ring-2 ring-persimmon-500 shadow-card"
                    : "bg-white/50 ring-graphite-900/10 hover:bg-white hover:ring-graphite-900/20",
                )}
              >
                <opt.icon className={cn("h-4 w-4", visibility === opt.value ? "text-persimmon-600" : "text-graphite-500")} />
                <div className="mt-2 text-sm font-medium">{opt.title}</div>
                <div className="mt-0.5 text-xs leading-relaxed text-graphite-500">{opt.body}</div>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-[0.8rem] font-medium text-graphite-800">Colour</legend>
          <div className="mt-2 flex gap-2">
            {(Object.keys(WORKSPACE_COLORS) as WorkspaceColor[]).map((key) => (
              <button
                type="button"
                key={key}
                onClick={() => setColor(key)}
                aria-label={WORKSPACE_COLORS[key].label}
                aria-pressed={color === key}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg ring-offset-2 ring-offset-sand-50 transition-transform hover:scale-105",
                  color === key && "ring-2 ring-graphite-900",
                )}
                style={{ backgroundColor: WORKSPACE_COLORS[key].hex }}
              >
                {color === key && <Check className="h-4 w-4" style={{ color: WORKSPACE_COLORS[key].text }} />}
              </button>
            ))}
          </div>
        </fieldset>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
