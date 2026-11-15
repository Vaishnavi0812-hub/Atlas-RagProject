import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

/** Mirrors the backend password policy (app/schemas/common.py). */
export const PASSWORD_RULES = [
  { label: "10+ characters", test: (p: string) => p.length >= 10 },
  { label: "Lowercase letter", test: (p: string) => /[a-z]/.test(p) },
  { label: "Uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "Number", test: (p: string) => /\d/.test(p) },
];

export const isPasswordValid = (p: string) => PASSWORD_RULES.every((r) => r.test(p));

const LEVELS = [
  { label: "Too weak", color: "bg-red-500" },
  { label: "Weak", color: "bg-persimmon-500" },
  { label: "Fair", color: "bg-gold-500" },
  { label: "Good", color: "bg-cobalt-500" },
  { label: "Strong", color: "bg-emerald-500" },
];

export function PasswordStrength({ password }: { password: string }) {
  const passed = PASSWORD_RULES.filter((r) => r.test(password)).length;
  const bonus = password.length >= 14 && /[^A-Za-z0-9]/.test(password) ? 1 : 0;
  const score = Math.min(passed + bonus, 4);
  const level = LEVELS[password ? score : 0];

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-3">
        <div className="flex flex-1 gap-1">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-graphite-900/10">
              <motion.div
                className={cn("h-full rounded-full", level.color)}
                initial={false}
                animate={{ width: password && i < score ? "100%" : "0%" }}
                transition={{ duration: 0.3, delay: i * 0.04 }}
              />
            </div>
          ))}
        </div>
        <span className="w-16 text-right font-mono text-[0.65rem] uppercase tracking-wider text-graphite-500">
          {password ? level.label : ""}
        </span>
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
        {PASSWORD_RULES.map((rule) => {
          const ok = rule.test(password);
          return (
            <li
              key={rule.label}
              className={cn(
                "flex items-center gap-1.5 text-xs transition-colors",
                ok ? "text-emerald-700" : "text-graphite-500",
              )}
            >
              <span
                className={cn(
                  "flex h-3.5 w-3.5 items-center justify-center rounded-full transition-colors",
                  ok ? "bg-emerald-500 text-white" : "bg-graphite-900/10",
                )}
              >
                {ok && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
              </span>
              {rule.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
