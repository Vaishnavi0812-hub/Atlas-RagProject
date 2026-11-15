import { motion, type HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/cn";
import { riseItem } from "@/lib/motion";

interface CardProps extends HTMLMotionProps<"div"> {
  interactive?: boolean;
  tone?: "light" | "dark";
}

export function Card({ interactive, tone = "light", className, children, ...props }: CardProps) {
  return (
    <motion.div
      variants={riseItem}
      whileHover={interactive ? { y: -2 } : undefined}
      transition={{ duration: 0.25 }}
      className={cn(
        "relative rounded-2xl",
        tone === "light"
          ? "bg-white/80 shadow-card ring-1 ring-graphite-900/[0.06]"
          : "bg-graphite-900 text-sand-100 ring-1 ring-white/[0.06]",
        interactive && "cursor-pointer transition-shadow duration-300 hover:shadow-lift",
        className,
      )}
      {...props}
    >
      {children}
    </motion.div>
  );
}
