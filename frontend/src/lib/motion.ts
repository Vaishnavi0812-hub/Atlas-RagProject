import type { Transition, Variants } from "framer-motion";

/** Shared easing — a calm, decelerating curve used throughout ATLAS. */
export const ease = [0.22, 1, 0.36, 1] as const;

export const spring: Transition = { type: "spring", stiffness: 380, damping: 34 };

export const pageVariants: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.42, ease } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.18, ease } },
};

export const staggerContainer: Variants = {
  animate: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};

export const riseItem: Variants = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.5, ease } },
};
