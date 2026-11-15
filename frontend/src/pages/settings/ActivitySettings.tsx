import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Activity,
  Building2,
  FolderKanban,
  KeyRound,
  MailPlus,
  ShieldCheck,
  UserMinus,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { tenantKeys, useTenant } from "@/context/TenantContext";
import { api, type ActivityEvent } from "@/lib/api";
import { timeAgo } from "@/lib/format";

const PAGE = 30;

const ICON_BY_PREFIX: [string, LucideIcon, string][] = [
  ["organization.", Building2, "bg-graphite-900 text-sand-100"],
  ["workspace.access", KeyRound, "bg-gold-100 text-gold-700"],
  ["workspace.", FolderKanban, "bg-cobalt-100 text-cobalt-700"],
  ["invitation.", MailPlus, "bg-persimmon-100 text-persimmon-600"],
  ["member.joined", UserPlus, "bg-emerald-50 text-emerald-700"],
  ["member.role", ShieldCheck, "bg-cobalt-100 text-cobalt-700"],
  ["member.", UserMinus, "bg-sand-200 text-graphite-700"],
];

function iconFor(action: string) {
  const match = ICON_BY_PREFIX.find(([prefix]) => action.startsWith(prefix));
  return match ? { Icon: match[1], tone: match[2] } : { Icon: Activity, tone: "bg-sand-200 text-graphite-700" };
}

export function ActivitySettings() {
  const { organizationId, workspaces } = useTenant();
  const [workspaceId, setWorkspaceId] = useState("");

  const query = useInfiniteQuery({
    queryKey: tenantKeys.activity(organizationId ?? "none", workspaceId || undefined),
    queryFn: ({ pageParam }) =>
      api.orgs.activity(organizationId!, {
        workspace_id: workspaceId || undefined,
        before: pageParam,
        limit: PAGE,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.length === PAGE ? last[last.length - 1].created_at : undefined),
    enabled: !!organizationId,
    staleTime: 0,
  });

  const events = query.data?.pages.flat() ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-xl">Activity</h2>
          <p className="mt-1 max-w-xl text-sm text-graphite-600">
            An audit trail of changes in this organization. You only see events for workspaces you can access.
          </p>
        </div>
        <Select value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} className="sm:w-60" aria-label="Filter by workspace">
          <option value="">All activity</option>
          {workspaces.map((ws) => (
            <option key={ws.id} value={ws.id}>
              {ws.name}
            </option>
          ))}
        </Select>
      </div>

      {query.isLoading ? (
        <Card className="space-y-5 p-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          ))}
        </Card>
      ) : events.length === 0 ? (
        <EmptyState icon={Activity} title="No activity yet" description="Changes to members, workspaces and invitations will appear here." />
      ) : (
        <Card className="p-6">
          <ol className="relative">
            <span className="absolute bottom-4 left-4 top-4 w-px bg-graphite-900/10" aria-hidden />
            {events.map((event, i) => (
              <ActivityRow key={event.id} event={event} index={i} />
            ))}
          </ol>
          {query.hasNextPage && (
            <div className="mt-4 flex justify-center">
              <Button variant="secondary" size="sm" loading={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>
                Load older activity
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function ActivityRow({ event, index }: { event: ActivityEvent; index: number }) {
  const { Icon, tone } = iconFor(event.action);
  return (
    <motion.li
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(index, 12) * 0.025 }}
      className="relative flex gap-3 py-2.5"
    >
      <span className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ring-white ${tone}`}>
        <Icon className="h-3.5 w-3.5" strokeWidth={2} />
      </span>
      <div className="min-w-0 pt-1">
        <p className="text-sm leading-snug text-graphite-700">
          <span className="font-medium text-graphite-900">{event.actor_name ?? "Someone"}</span> {event.summary}
        </p>
        <p className="mt-0.5 font-mono text-[0.65rem] uppercase tracking-wider text-graphite-400">
          {timeAgo(event.created_at)}
          {event.workspace_name && ` · ${event.workspace_name}`}
        </p>
      </div>
    </motion.li>
  );
}
