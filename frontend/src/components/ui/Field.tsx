import {
  forwardRef,
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/cn";

const control =
  "w-full rounded-lg bg-white px-3.5 text-sm text-graphite-900 shadow-inset outline-none transition-shadow duration-200 " +
  "placeholder:text-graphite-400 hover:shadow-[inset_0_0_0_1px_rgba(32,33,36,0.18)] " +
  "focus:shadow-[inset_0_0_0_1.5px_#FF7849,0_0_0_4px_rgba(255,120,73,0.12)] disabled:cursor-not-allowed disabled:bg-sand-50 disabled:text-graphite-500";

const invalid = "shadow-[inset_0_0_0_1.5px_#DC2626] hover:shadow-[inset_0_0_0_1.5px_#DC2626]";

type FieldShellProps = {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  id: string;
  children: ReactNode;
  className?: string;
  trailingLabel?: ReactNode;
};

export function FieldShell({ label, hint, error, id, children, className, trailingLabel }: FieldShellProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {(label || trailingLabel) && (
        <div className="flex items-baseline justify-between">
          {label && (
            <label htmlFor={id} className="text-[0.8rem] font-medium text-graphite-800">
              {label}
            </label>
          )}
          {trailingLabel}
        </div>
      )}
      {children}
      <AnimatePresence initial={false} mode="wait">
        {error ? (
          <motion.p
            key="error"
            id={`${id}-error`}
            role="alert"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-xs text-red-600"
          >
            {error}
          </motion.p>
        ) : hint ? (
          <motion.p key="hint" className="text-xs text-graphite-500" initial={false}>
            {hint}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  trailingLabel?: ReactNode;
  containerClassName?: string;
};

export const TextField = forwardRef<HTMLInputElement, InputProps>(function TextField(
  { label, hint, error, trailingLabel, containerClassName, className, id, type, ...props },
  ref,
) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const [reveal, setReveal] = useState(false);
  const isPassword = type === "password";

  return (
    <FieldShell
      label={label}
      hint={hint}
      error={error}
      id={fieldId}
      className={containerClassName}
      trailingLabel={trailingLabel}
    >
      <div className="relative">
        <input
          ref={ref}
          id={fieldId}
          type={isPassword && reveal ? "text" : type}
          aria-invalid={!!error}
          aria-describedby={error ? `${fieldId}-error` : undefined}
          className={cn(control, "h-11", isPassword && "pr-11", error && invalid, className)}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-graphite-400 transition-colors hover:bg-graphite-900/5 hover:text-graphite-700"
            aria-label={reveal ? "Hide password" : "Show password"}
          >
            {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
    </FieldShell>
  );
});

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
};

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { label, hint, error, className, id, ...props },
  ref,
) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <FieldShell label={label} hint={hint} error={error} id={fieldId}>
      <textarea
        ref={ref}
        id={fieldId}
        aria-invalid={!!error}
        className={cn(control, "min-h-[88px] resize-y py-2.5 leading-relaxed", error && invalid, className)}
        {...props}
      />
    </FieldShell>
  );
});

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  size?: "sm" | "md";
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, className, id, size = "md", children, ...props },
  ref,
) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const select = (
    <div className="relative">
      <select
        ref={ref}
        id={fieldId}
        className={cn(
          control,
          "appearance-none pr-9",
          size === "sm" ? "h-8 text-[0.8rem]" : "h-11",
          error && invalid,
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-graphite-400" />
    </div>
  );
  if (!label && !hint && !error) return select;
  return (
    <FieldShell label={label} hint={hint} error={error} id={fieldId}>
      {select}
    </FieldShell>
  );
});
