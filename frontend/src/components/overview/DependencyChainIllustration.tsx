import { motion } from "framer-motion";
import { ease } from "@/lib/motion";

/**
 * Illustration of the multi-hop question ATLAS is built to answer:
 * Vendor → Product → Project → Contract, each fact from a different document.
 * Purely explanatory — it is labelled as an example, not live data.
 */
// Zig-zag layout: top-row nodes are captioned above, bottom-row nodes below,
// so edge labels at the midpoints never collide with captions.
const TOP_Y = 80;
const BOTTOM_Y = 175;
const NODES = [
  { id: "vendor", x: 75, y: TOP_Y, label: "Vendor Alpha", kind: "Vendor", color: "#FF7849", doc: "Doc A" },
  { id: "product", x: 235, y: BOTTOM_Y, label: "Product X", kind: "Product", color: "#4776D0", doc: "Doc B" },
  { id: "project", x: 405, y: TOP_Y, label: "Project Delta", kind: "Project", color: "#D6AD64", doc: "Doc C" },
  { id: "contract", x: 565, y: BOTTOM_Y, label: "Contract 123", kind: "Contract", color: "#F4EFE6", doc: "Doc D" },
] as const;

const EDGES = [
  { from: 0, to: 1, label: "SUPPLIES" },
  { from: 1, to: 2, label: "USED_IN" },
  { from: 2, to: 3, label: "GOVERNED_BY" },
] as const;

export function DependencyChainIllustration() {
  return (
    <svg viewBox="0 0 640 245" className="h-auto w-full" role="img" aria-label="Example dependency chain across four documents">
      <defs>
        <pattern id="dots" width="16" height="16" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="#F4EFE6" fillOpacity="0.06" />
        </pattern>
      </defs>
      <rect width="640" height="245" fill="url(#dots)" />

      {EDGES.map((edge, i) => {
        const a = NODES[edge.from];
        const b = NODES[edge.to];
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        return (
          <g key={edge.label}>
            <motion.line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="#F4EFE6"
              strokeOpacity={0.35}
              strokeWidth={1.25}
              strokeDasharray="4 4"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.9, ease, delay: 0.4 + i * 0.45 }}
            />
            <motion.g
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.9 + i * 0.45 }}
            >
              <rect x={mx - 42} y={my - 10} width={84} height={20} rx={4} fill="#2B2C30" stroke="#F4EFE6" strokeOpacity={0.12} />
              <text x={mx} y={my + 4} textAnchor="middle" fill="#9A9AA0" fontSize={9} fontFamily="JetBrains Mono" letterSpacing="0.08em">
                {edge.label}
              </text>
            </motion.g>
          </g>
        );
      })}

      {NODES.map((node, i) => (
        <motion.g
          key={node.id}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease, delay: 0.15 + i * 0.45 }}
          style={{ transformOrigin: `${node.x}px ${node.y}px` }}
        >
          <circle cx={node.x} cy={node.y} r={20} fill={node.color} fillOpacity={0.12} />
          <circle cx={node.x} cy={node.y} r={8} fill={node.color} />
          <text x={node.x} y={node.y === TOP_Y ? node.y - 44 : node.y + 38} textAnchor="middle" fill="#F4EFE6" fontSize={13} fontFamily="Instrument Sans" fontWeight={500}>
            {node.label}
          </text>
          <text x={node.x} y={node.y === TOP_Y ? node.y - 30 : node.y + 53} textAnchor="middle" fill="#76777D" fontSize={9} fontFamily="JetBrains Mono" letterSpacing="0.1em">
            {node.kind.toUpperCase()} · {node.doc.toUpperCase()}
          </text>
        </motion.g>
      ))}
    </svg>
  );
}
