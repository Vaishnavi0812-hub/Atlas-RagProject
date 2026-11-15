import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { ease } from "@/lib/motion";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-6 border-b hairline pb-8 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl">
        <motion.p
          className="eyebrow"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
        >
          {eyebrow}
        </motion.p>
        <motion.h1
          className="mt-3 text-display-lg text-graphite-900 md:text-display-xl"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease, delay: 0.05 }}
        >
          {title}
        </motion.h1>
        {description && (
          <motion.p
            className="mt-4 max-w-xl text-[0.98rem] leading-relaxed text-graphite-600"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease, delay: 0.12 }}
          >
            {description}
          </motion.p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
