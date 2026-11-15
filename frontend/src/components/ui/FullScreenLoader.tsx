import { motion } from "framer-motion";
import { AtlasMark } from "@/components/layout/AtlasLogo";

export function FullScreenLoader({ label = "Loading ATLAS" }: { label?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 bg-sand-100" role="status">
      <motion.div
        animate={{ scale: [1, 1.06, 1] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      >
        <AtlasMark size={44} />
      </motion.div>
      <div className="h-0.5 w-32 overflow-hidden rounded-full bg-graphite-900/10">
        <motion.div
          className="h-full w-1/3 rounded-full bg-persimmon-500"
          animate={{ x: ["-100%", "300%"] }}
          transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
      <span className="eyebrow">{label}</span>
    </div>
  );
}
