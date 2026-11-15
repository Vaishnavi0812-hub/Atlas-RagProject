import { motion } from "framer-motion";
import { Boxes, Database, Network, RefreshCw, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusDot } from "@/components/ui/StatusDot";
import { useHealth } from "@/hooks/useHealth";
import { staggerContainer } from "@/lib/motion";
import type { DependencyStatus } from "@/lib/api";

const SERVICE_META: Record<
  DependencyStatus["name"],
  { label: string; role: string; icon: LucideIcon }
> = {
  postgres: { label: "PostgreSQL", role: "Accounts, workspaces, documents, conversations", icon: Database },
  neo4j: { label: "Neo4j", role: "Knowledge graph: entities, relationships, provenance", icon: Network },
  qdrant: { label: "Qdrant", role: "Chunk embeddings and filtered semantic search", icon: Boxes },
  redis: { label: "Redis", role: "Background jobs, coordination and caching", icon: Zap },
};

export function SystemPage() {
  const { data, isLoading, isError, refetch, isFetching, dataUpdatedAt } = useHealth();

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Administration · System"
        title="Service health"
        description="Live connectivity checks against each datastore ATLAS depends on. Checks refresh every 30 seconds."
        actions={
          <Button
            variant="secondary"
            onClick={() => refetch()}
            loading={isFetching}
            icon={<RefreshCw className="h-4 w-4" />}
          >
            Recheck
          </Button>
        }
      />

      {isError && (
        <Card className="border-l-4 border-persimmon-500 p-5">
          <p className="font-medium">The API is unreachable.</p>
          <p className="mt-1 text-sm text-graphite-600">
            Start the stack with <code className="font-mono text-xs">docker compose up -d</code> and
            make sure the backend is listening on port 8010.
          </p>
        </Card>
      )}

      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="grid gap-4 md:grid-cols-2"
      >
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="p-6">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="mt-4 h-4 w-3/4" />
                <Skeleton className="mt-6 h-8 w-24" />
              </Card>
            ))
          : data?.dependencies.map((dep) => {
              const meta = SERVICE_META[dep.name];
              return (
                <Card key={dep.name} className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-graphite-900 text-sand-100">
                        <meta.icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                      </div>
                      <div>
                        <h3 className="font-display text-lg leading-tight">{meta.label}</h3>
                        <p className="text-xs text-graphite-500">{meta.role}</p>
                      </div>
                    </div>
                    <Badge tone={dep.status === "ok" ? "success" : "danger"}>
                      <StatusDot status={dep.status} />
                      {dep.status === "ok" ? "Healthy" : "Unreachable"}
                    </Badge>
                  </div>
                  <div className="mt-6 flex items-baseline gap-2">
                    <span className="font-display text-3xl tabular-nums">
                      {dep.latency_ms !== null ? dep.latency_ms.toFixed(1) : "—"}
                    </span>
                    <span className="font-mono text-xs text-graphite-500">
                      {dep.latency_ms !== null ? "ms round-trip" : dep.detail}
                    </span>
                  </div>
                </Card>
              );
            })}
      </motion.div>

      {data && (
        <p className="font-mono text-xs text-graphite-500">
          Environment: {data.environment} · Last checked{" "}
          {new Date(dataUpdatedAt).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}
