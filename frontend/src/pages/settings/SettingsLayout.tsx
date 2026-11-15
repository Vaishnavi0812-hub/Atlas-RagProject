import { NavLink, useLocation, useOutlet } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, Building2, FolderKanban, UserRound, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { useTenant } from "@/context/TenantContext";
import { cn } from "@/lib/cn";
import { ease } from "@/lib/motion";

const TABS = [
  { to: "profile", label: "Profile", icon: UserRound },
  { to: "organization", label: "Organization", icon: Building2 },
  { to: "members", label: "Members", icon: Users },
  { to: "workspaces", label: "Workspaces", icon: FolderKanban },
  { to: "activity", label: "Activity", icon: Activity },
];

export function SettingsLayout() {
  const { organization } = useTenant();
  const location = useLocation();
  const outlet = useOutlet();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Administration · Settings"
        title="Settings"
        description={
          organization
            ? `Your profile, and how ${organization.name} is organized: members, roles, workspaces and activity.`
            : "Your profile and organization."
        }
      />

      <nav className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0" aria-label="Settings sections">
        <ul className="flex min-w-max gap-1 border-b hairline">
          {TABS.map((tab) => (
            <li key={tab.to}>
              <NavLink
                to={`/settings/${tab.to}`}
                className={({ isActive }) =>
                  cn(
                    "relative flex items-center gap-2 px-3.5 pb-3 pt-1 text-sm transition-colors",
                    isActive ? "text-graphite-900" : "text-graphite-500 hover:text-graphite-800",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <tab.icon className={cn("h-4 w-4", isActive && "text-persimmon-600")} strokeWidth={1.75} />
                    {tab.label}
                    {isActive && (
                      <motion.span
                        layoutId="settings-tab"
                        className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-persimmon-500"
                        transition={{ type: "spring", stiffness: 480, damping: 38 }}
                      />
                    )}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <AnimatePresence mode="wait">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.35, ease } }}
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
        >
          {outlet}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/** Two-column settings section: title + description on the left, content right. */
export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-6 border-b hairline py-8 first:pt-0 last:border-0 lg:grid-cols-[280px_1fr] lg:gap-12">
      <div>
        <h2 className="font-display text-xl">{title}</h2>
        {description && <p className="mt-1.5 text-sm leading-relaxed text-graphite-600">{description}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
