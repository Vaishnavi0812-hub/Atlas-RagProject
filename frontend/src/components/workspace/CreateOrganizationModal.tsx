import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal } from "@/components/ui/Modal";
import { TextField } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { FormError } from "@/components/auth/AuthLayout";
import { api } from "@/lib/api";
import { SESSION_KEY } from "@/hooks/useSession";
import { useTenant } from "@/context/TenantContext";

export function CreateOrganizationModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const qc = useQueryClient();
  const toast = useToast();
  const { switchOrganization } = useTenant();

  useEffect(() => {
    if (open) setName("");
  }, [open]);

  const create = useMutation({
    mutationFn: () => api.orgs.create(name),
    onSuccess: async (org) => {
      await qc.invalidateQueries({ queryKey: SESSION_KEY });
      switchOrganization(org.id);
      toast({ title: `Created ${org.name}`, description: "You’re its owner. A General workspace is ready." });
      onClose();
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length >= 2) create.mutate();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="New organization"
      description="Organizations keep their documents, graphs and members completely separate."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => create.mutate()} loading={create.isPending} disabled={name.trim().length < 2}>
            Create organization
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <FormError message={create.error?.message ?? null} />
        <TextField label="Organization name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoso Manufacturing" />
      </form>
    </Modal>
  );
}
