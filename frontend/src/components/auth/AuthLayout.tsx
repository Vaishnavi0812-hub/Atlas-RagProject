import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { AtlasMark } from "@/components/layout/AtlasLogo";
import { DependencyChainIllustration } from "@/components/overview/DependencyChainIllustration";
import { ease } from "@/lib/motion";

export function AuthLayout({
  eyebrow,
  title,
  description,
  children,
  footer,
}: {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="grid min-h-full lg:grid-cols-[1.05fr_1fr]">
      {/* Editorial panel */}
      <aside className="relative hidden overflow-hidden bg-graphite-900 text-sand-100 lg:flex lg:flex-col">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(244,239,230,0.06)_1px,transparent_1px)] [background-size:22px_22px]" />
        <div className="pointer-events-none absolute -right-40 -top-40 h-[28rem] w-[28rem] rounded-full bg-persimmon-500/10 blur-3xl" />
        <div className="relative flex items-center gap-3 px-12 pt-10">
          <AtlasMark size={34} />
          <div className="leading-none">
            <div className="font-display text-lg font-semibold">ATLAS</div>
            <div className="mt-1 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-graphite-400">
              Enterprise Knowledge Intelligence
            </div>
          </div>
        </div>

        <div className="relative mt-auto px-12">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease }}
            className="max-w-lg font-display text-[2.4rem] leading-[1.08] tracking-[-0.02em]"
          >
            Every answer, traced back to the{" "}
            <em className="pr-1 italic text-persimmon-500">documents</em> and relationships behind it.
          </motion.p>
          <div className="-mx-4 mt-10 max-w-xl opacity-90">
            <DependencyChainIllustration />
          </div>
        </div>

        <div className="relative flex items-center justify-between px-12 pb-10 pt-8 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-graphite-500">
          <span>Documents → Graph → Evidence</span>
          <span>GraphRAG</span>
        </div>
      </aside>

      {/* Form panel */}
      <main className="flex flex-col bg-sand-100">
        <div className="flex items-center gap-3 px-6 pt-6 lg:hidden">
          <AtlasMark size={30} />
          <span className="font-display text-lg font-semibold">ATLAS</span>
        </div>
        <div className="flex flex-1 items-center justify-center px-6 py-12">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease }}
            className="w-full max-w-[400px]"
          >
            <p className="eyebrow">{eyebrow}</p>
            <h1 className="mt-3 text-display-lg">{title}</h1>
            {description && <p className="mt-3 text-sm leading-relaxed text-graphite-600">{description}</p>}
            <div className="mt-8">{children}</div>
            {footer && <div className="mt-8 text-sm text-graphite-600">{footer}</div>}
          </motion.div>
        </div>
      </main>
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700"
    >
      {message}
    </motion.div>
  );
}
