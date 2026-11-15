import { useEffect, useState, type ReactNode } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { TextField } from "./Field";

/**
 * Confirmation for destructive actions. When `confirmText` is given, the user
 * must type it exactly before the action is enabled.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  confirmText,
  loading,
  tone = "danger",
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  confirmText?: string;
  loading?: boolean;
  tone?: "danger" | "default";
}) {
  const [typed, setTyped] = useState("");
  useEffect(() => {
    if (!open) setTyped("");
  }, [open]);
  const blocked = !!confirmText && typed !== confirmText;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={tone === "danger" ? "dark" : "primary"}
            className={tone === "danger" ? "bg-red-600 text-white hover:bg-red-700" : undefined}
            onClick={onConfirm}
            disabled={blocked}
            loading={loading}
            data-autofocus={!confirmText || undefined}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm leading-relaxed text-graphite-700">
        <div>{description}</div>
        {confirmText && (
          <TextField
            label={
              <>
                Type <span className="font-mono text-graphite-900">{confirmText}</span> to confirm
              </>
            }
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
          />
        )}
      </div>
    </Modal>
  );
}
