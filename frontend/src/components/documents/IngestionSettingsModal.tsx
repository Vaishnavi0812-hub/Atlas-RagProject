import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { FormError } from "@/components/auth/AuthLayout";
import { api, type Workspace } from "@/lib/api";
import { tenantKeys } from "@/context/TenantContext";
import { cn } from "@/lib/cn";

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  hint: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="text-[0.8rem] font-medium text-graphite-800">{label}</label>
        <span className="font-mono text-sm tabular-nums">{value} chars</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full accent-persimmon-500"
        style={{ background: `linear-gradient(to right, #FF7849 ${pct}%, rgba(32,33,36,0.1) ${pct}%)` }}
      />
      <p className="mt-1 text-xs text-graphite-500">{hint}</p>
    </div>
  );
}

export function IngestionSettingsModal({ open, onClose, workspace }: { open: boolean; onClose: () => void; workspace: Workspace }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [size, setSize] = useState(workspace.settings.chunk_size);
  const [overlap, setOverlap] = useState(workspace.settings.chunk_overlap);
  const [viewersDownload, setViewersDownload] = useState(workspace.settings.viewers_can_download);

  useEffect(() => {
    if (!open) return;
    setSize(workspace.settings.chunk_size);
    setOverlap(workspace.settings.chunk_overlap);
    setViewersDownload(workspace.settings.viewers_can_download);
  }, [open, workspace]);

  const maxOverlap = Math.floor(size / 2);
  useEffect(() => {
    if (overlap > maxOverlap) setOverlap(maxOverlap);
  }, [maxOverlap, overlap]);

  const save = useMutation({
    mutationFn: () =>
      api.workspaces.update(workspace.organization_id, workspace.id, {
        settings: { chunk_size: size, chunk_overlap: overlap, viewers_can_download: viewersDownload },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tenantKeys.workspaces(workspace.organization_id) });
      toast({ title: "Ingestion settings saved", description: "They apply to new uploads and reprocessed documents." });
      onClose();
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Ingestion settings"
      description={`How documents in ${workspace.name} are split and who can open the originals.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            Save settings
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <FormError message={save.error?.message ?? null} />
        <Slider
          label="Chunk size"
          value={size}
          min={300}
          max={4000}
          step={50}
          onChange={setSize}
          hint="Larger chunks keep more context per passage; smaller chunks make retrieval more precise."
        />
        <Slider
          label="Chunk overlap"
          value={overlap}
          min={0}
          max={maxOverlap}
          step={10}
          onChange={setOverlap}
          hint="Text repeated between neighbouring chunks so facts spanning a boundary aren’t lost. At most half the chunk size."
        />
        <div className="rounded-xl bg-white/70 p-4 ring-1 ring-graphite-900/[0.06]">
          <label className="flex cursor-pointer items-start justify-between gap-4">
            <span>
              <span className="block text-sm font-medium">Viewers can open original files</span>
              <span className="mt-0.5 block text-xs text-graphite-500">
                When off, viewers see extracted passages only. Editors and admins can always download.
              </span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={viewersDownload}
              onClick={() => setViewersDownload((v) => !v)}
              className={cn("relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors", viewersDownload ? "bg-persimmon-500" : "bg-graphite-900/20")}
            >
              <span className={cn("absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform", viewersDownload ? "translate-x-[22px]" : "translate-x-0.5")} />
            </button>
          </label>
        </div>
        <p className="text-xs text-graphite-500">Existing documents keep their current chunks until you reprocess them.</p>
      </div>
    </Modal>
  );
}
