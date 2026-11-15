import { Link } from "react-router-dom";
import { Menu, Search } from "lucide-react";
import { useHealth } from "@/hooks/useHealth";
import { StatusDot } from "@/components/ui/StatusDot";
import { TenantSwitcher } from "./TenantSwitcher";
import { UserMenu } from "./UserMenu";

export function Topbar({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  const health = useHealth();
  const status = health.isLoading ? "loading" : health.data?.status === "ok" ? "ok" : "error";

  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-2 border-b hairline bg-sand-100/85 px-4 backdrop-blur-md md:px-8">
      <button
        onClick={onOpenMobileNav}
        className="-ml-1 rounded-lg p-2 text-graphite-700 hover:bg-graphite-900/5 lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      <TenantSwitcher />

      <div className="ml-auto flex items-center gap-1.5">
        <div className="hidden h-9 w-60 items-center gap-2 rounded-lg bg-white/70 px-3 text-sm text-graphite-400 shadow-inset xl:flex">
          <Search className="h-4 w-4 shrink-0" />
          <span className="truncate">Search entities, documents…</span>
          <kbd className="ml-auto rounded border border-graphite-900/10 px-1.5 font-mono text-[0.65rem]">/</kbd>
        </div>
        <Link
          to="/system"
          title={status === "ok" ? "All systems operational" : "Some services are degraded"}
          className="flex h-9 items-center gap-2 rounded-lg px-2.5 text-xs font-medium text-graphite-600 transition-colors hover:bg-graphite-900/5"
        >
          <StatusDot status={status} />
          <span className="hidden md:inline">
            {status === "loading" ? "Checking" : status === "ok" ? "All systems" : "Degraded"}
          </span>
        </Link>
        <UserMenu />
      </div>
    </header>
  );
}
