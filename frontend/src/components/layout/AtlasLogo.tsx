import { motion } from "framer-motion";

/** ATLAS mark: three connected nodes — a tiny knowledge graph. */
export function AtlasMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#2B2C30" />
      <motion.path
        d="M16 9 L9 22 M16 9 L23 22 M9 22 L23 22"
        stroke="#F4EFE6"
        strokeOpacity={0.5}
        strokeWidth={1.3}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.2, ease: "easeInOut" }}
      />
      <circle cx="16" cy="9" r="3" fill="#FF7849" />
      <circle cx="9" cy="22" r="2.5" fill="#F4EFE6" />
      <circle cx="23" cy="22" r="2.5" fill="#D6AD64" />
    </svg>
  );
}
