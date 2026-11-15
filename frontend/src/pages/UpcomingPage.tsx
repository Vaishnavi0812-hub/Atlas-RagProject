import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";

/**
 * Designed placeholder for modules that are built in later stages. Keeps
 * navigation complete without showing fabricated data.
 */
export function UpcomingPage({
  eyebrow,
  title,
  description,
  icon,
  emptyTitle,
  emptyDescription,
  stage,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  emptyTitle: string;
  emptyDescription: string;
  stage: number;
}) {
  return (
    <div className="space-y-10">
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      <EmptyState
        icon={icon}
        title={emptyTitle}
        description={emptyDescription}
        footnote={<Badge tone="gold">In development · Stage {stage}</Badge>}
      />
    </div>
  );
}
