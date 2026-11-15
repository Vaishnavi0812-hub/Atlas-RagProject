import type { ReactNode } from "react";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { ease } from "@/lib/motion";

/**
 * Editorial empty state: an icon set inside concentric rings, a serif
 * headline and a short explanation of what will appear here.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  footnote,
}: {
  icon: LucideIcon;
  title: string;
  description: ReactNode;
  action?: ReactNode;
  footnote?: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease }}
      className="relative flex flex-col items-center overflow-hidden rounded-2xl border border-dashed border-graphite-900/15 bg-white/50 px-6 py-16 text-center"
    >
      <div className="pointer-events-none absolute inset-0 bg-grain [background-size:18px_18px] opacity-60 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
      <div className="relative mb-6 flex h-28 w-28 items-center justify-center">
        {[0, 1, 2].map((ring) => (
          <motion.span
            key={ring}
            className="absolute rounded-full border border-graphite-900/10"
            style={{ inset: ring * 14 }}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.8, ease, delay: 0.1 + ring * 0.08 }}
          />
        ))}
        <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-graphite-900 text-persimmon-500 shadow-lift">
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </div>
      </div>
      <h3 className="relative text-display-md text-graphite-900">{title}</h3>
      <p className="relative mt-3 max-w-md text-sm leading-relaxed text-graphite-600">
        {description}
      </p>
      {action && <div className="relative mt-6">{action}</div>}
      {footnote && <div className="relative mt-6">{footnote}</div>}
    </motion.div>
  );
}
