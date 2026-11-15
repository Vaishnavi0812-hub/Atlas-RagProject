import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "dark";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "bg-persimmon-500 text-graphite-950 hover:bg-persimmon-600 hover:text-white shadow-[0_1px_0_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.25)]",
  secondary:
    "bg-white text-graphite-900 shadow-inset hover:bg-sand-50 hover:shadow-[inset_0_0_0_1px_rgba(32,33,36,0.18)]",
  ghost: "text-graphite-700 hover:bg-graphite-900/[0.05] hover:text-graphite-900",
  dark: "bg-graphite-900 text-sand-100 hover:bg-graphite-800",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[0.8rem] gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-5 text-[0.95rem] gap-2",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, icon, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex select-none items-center justify-center rounded-lg font-medium transition-all duration-200",
        "active:translate-y-px disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});
