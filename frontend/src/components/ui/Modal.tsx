import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { ease } from "@/lib/motion";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
};

const widths = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl" };

export function Modal({ open, onClose, title, description, children, footer, size = "md" }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    // Focus the first field (or the panel) once the entrance animation starts.
    const t = window.setTimeout(() => {
      const target = panelRef.current?.querySelector<HTMLElement>(
        "input:not([type=hidden]), textarea, select, [data-autofocus]",
      );
      (target ?? panelRef.current)?.focus();
    }, 40);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-6">
          <motion.div
            className="absolute inset-0 bg-graphite-950/45 backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            className={cn(
              "relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-sand-50 shadow-lift outline-none ring-1 ring-graphite-900/10 sm:rounded-2xl",
              widths[size],
            )}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.32, ease } }}
            exit={{ opacity: 0, y: 12, scale: 0.98, transition: { duration: 0.16 } }}
          >
            <div className="flex items-start justify-between gap-4 border-b hairline px-6 pb-4 pt-5">
              <div>
                <h2 className="font-display text-xl leading-tight">{title}</h2>
                {description && <p className="mt-1 text-sm text-graphite-600">{description}</p>}
              </div>
              <button
                onClick={onClose}
                className="-mr-2 rounded-lg p-1.5 text-graphite-400 transition-colors hover:bg-graphite-900/5 hover:text-graphite-800"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="scrollbar-thin overflow-y-auto px-6 py-5">{children}</div>
            {footer && (
              <div className="flex flex-col-reverse gap-2 border-t hairline bg-sand-100/60 px-6 py-4 sm:flex-row sm:justify-end">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
