import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/cn";

type Tone = "success" | "error" | "info";
type Toast = { id: number; title: string; description?: string; tone: Tone };
type ToastInput = Omit<Toast, "id" | "tone"> & { tone?: Tone };

const ToastContext = createContext<((t: ToastInput) => void) | null>(null);

const ICONS = { success: CheckCircle2, error: AlertTriangle, info: Info };
const ACCENT = {
  success: "text-emerald-400",
  error: "text-persimmon-500",
  info: "text-cobalt-300",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const push = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-3), { id, tone: "success", ...input }]);
      window.setTimeout(() => dismiss(id), input.tone === "error" ? 6500 : 4000);
    },
    [dismiss],
  );

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div
          aria-live="polite"
          className="pointer-events-none fixed inset-x-4 bottom-4 z-[80] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6"
        >
          <AnimatePresence initial={false}>
            {toasts.map((toast) => {
              const Icon = ICONS[toast.tone];
              return (
                <motion.div
                  key={toast.id}
                  layout
                  initial={{ opacity: 0, y: 16, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 24, transition: { duration: 0.18 } }}
                  transition={{ type: "spring", stiffness: 420, damping: 32 }}
                  className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl bg-graphite-900 px-4 py-3 text-sand-100 shadow-lift ring-1 ring-white/10 sm:w-96"
                  role={toast.tone === "error" ? "alert" : "status"}
                >
                  <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", ACCENT[toast.tone])} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{toast.title}</p>
                    {toast.description && (
                      <p className="mt-0.5 text-xs leading-relaxed text-graphite-400">{toast.description}</p>
                    )}
                  </div>
                  <button
                    onClick={() => dismiss(toast.id)}
                    className="rounded p-0.5 text-graphite-500 transition-colors hover:text-sand-100"
                    aria-label="Dismiss"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
