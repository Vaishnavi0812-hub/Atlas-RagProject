import { Link, useLocation } from "react-router-dom";
import { ChevronDown, Menu, Search } from "lucide-react";
import { useHealth } from "@/hooks/useHealth";
import { StatusDot } from "@/components/ui/StatusDot";
import { ALL_NAV_ITEMS } from "./navigation";

export function Topbar({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  const { pathname } = useLocation();
  const current = ALL_NAV_ITEMS.find((item) =>
    item.path === "/" ? pathname === "/" : pathname.startsWith(item.path),
  );
  const health = useHealth();
  const status = health.isLoading
    ? "loading"
    : health.data?.status === "ok"
      ? "ok"
      : "error";

  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b hairline bg-sand-100/85 px-4 backdrop-blur-md md:px-8">
      <button
        onClick={onOpenMobileNav}
        className="-ml-1 rounded-lg p-2 text-graphite-700 hover:bg-graphite-900/5 lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Workspace context — becomes a real switcher once organizations land (Stage 2). */}
      <button
        className="hidden items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-graphite-900/5 sm:flex"
        title="Organizations and workspaces arrive with authentication"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gold-500 font-display text-xs font-semibold text-graphite-900">
          A
        </span>
        <span className="font-medium text-graphite-900">Atlas Demo</span>
        <span className="text-graphite-400">/</span>
        <span className="text-graphite-600">Default workspace</span>
        <ChevronDown className="h-3.5 w-3.5 text-graphite-400" />
      </button>

      <span className="hidden text-graphite-300 sm:inline">·</span>
      <span className="truncate text-sm text-graphite-500">{current?.label}</span>

      <div className="ml-auto flex items-center gap-2">
        <div className="hidden h-9 w-64 items-center gap-2 rounded-lg bg-white/70 px-3 text-sm text-graphite-400 shadow-inset md:flex">
          <Search className="h-4 w-4" />
          <span className="truncate">Search entities, documents…</span>
          <kbd className="ml-auto rounded border border-graphite-900/10 px-1.5 font-mono text-[0.65rem]">
            /
          </kbd>
        </div>
        <Link
          to="/system"
          className="flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-medium text-graphite-600 transition-colors hover:bg-graphite-900/5"
        >
          <StatusDot status={status} />
          <span className="hidden sm:inline">
            {status === "loading" ? "Checking" : status === "ok" ? "All systems" : "Degraded"}
          </span>
        </Link>
      </div>
    </header>
  );
}
