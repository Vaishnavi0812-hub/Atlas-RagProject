import { NavLink } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { ease } from "@/lib/motion";
import { AtlasMark } from "./AtlasLogo";
import { NAVIGATION } from "./navigation";

export function Sidebar({
  collapsed,
  onToggle,
  onNavigate,
}: {
  collapsed: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
}) {
  return (
    <motion.aside
      animate={{ width: collapsed ? 76 : 256 }}
      transition={{ duration: 0.35, ease }}
      className="relative flex h-full flex-col overflow-hidden bg-graphite-900 text-sand-100"
    >
      {/* Brand */}
      <div className="flex h-16 shrink-0 items-center gap-3 px-[22px]">
        <AtlasMark />
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -6 }}
              transition={{ duration: 0.2 }}
              className="whitespace-nowrap leading-none"
            >
              <div className="font-display text-[1.15rem] font-semibold tracking-tight">ATLAS</div>
              <div className="mt-1 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-graphite-400">
                Knowledge Intelligence
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <nav className="scrollbar-thin flex-1 overflow-y-auto overflow-x-hidden px-3 pb-4 pt-4">
        {NAVIGATION.map((section) => (
          <div key={section.title} className="mb-6">
            <div
              className={cn(
                "mb-2 h-4 px-3 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-graphite-500 transition-opacity",
                collapsed && "opacity-0",
              )}
            >
              {section.title}
            </div>
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    end={item.path === "/"}
                    onClick={onNavigate}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      cn(
                        "group relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors duration-200",
                        isActive
                          ? "text-sand-50"
                          : "text-graphite-400 hover:bg-white/[0.04] hover:text-sand-100",
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <motion.span
                            layoutId="nav-active"
                            className="absolute inset-0 rounded-lg bg-white/[0.07] ring-1 ring-white/[0.06]"
                            transition={{ type: "spring", stiffness: 420, damping: 36 }}
                          />
                        )}
                        {isActive && (
                          <motion.span
                            layoutId="nav-active-bar"
                            className="absolute -left-3 top-2 bottom-2 w-[3px] rounded-r bg-persimmon-500"
                            transition={{ type: "spring", stiffness: 420, damping: 36 }}
                          />
                        )}
                        <item.icon
                          className={cn(
                            "relative h-[18px] w-[18px] shrink-0 transition-colors",
                            isActive ? "text-persimmon-500" : "group-hover:text-sand-100",
                          )}
                          strokeWidth={1.75}
                        />
                        <span
                          className={cn(
                            "relative whitespace-nowrap transition-opacity duration-200",
                            collapsed && "opacity-0",
                          )}
                        >
                          {item.label}
                        </span>
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Collapse toggle (desktop only) */}
      {onToggle && (
        <button
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="mx-3 mb-4 flex h-9 items-center gap-3 rounded-lg px-3 text-graphite-400 transition-colors hover:bg-white/[0.04] hover:text-sand-100"
        >
          {collapsed ? (
            <ChevronsRight className="h-4 w-4 shrink-0" />
          ) : (
            <ChevronsLeft className="h-4 w-4 shrink-0" />
          )}
          <span className={cn("whitespace-nowrap text-xs transition-opacity", collapsed && "opacity-0")}>
            Collapse
          </span>
        </button>
      )}
    </motion.aside>
  );
}
