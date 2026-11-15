import {
  BarChart3,
  FileStack,
  FlaskConical,
  Gauge,
  LayoutDashboard,
  MessagesSquare,
  Network,
  Scale,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  path: string;
  icon: LucideIcon;
  description: string;
};

export type NavSection = { title: string; items: NavItem[] };

export const NAVIGATION: NavSection[] = [
  {
    title: "Workspace",
    items: [
      { label: "Overview", path: "/", icon: LayoutDashboard, description: "Workspace at a glance" },
      { label: "Documents", path: "/documents", icon: FileStack, description: "Library & ingestion" },
      { label: "Knowledge Graph", path: "/graph", icon: Network, description: "Entities & relationships" },
      { label: "Ask ATLAS", path: "/chat", icon: MessagesSquare, description: "Evidence-backed answers" },
    ],
  },
  {
    title: "Intelligence",
    items: [
      { label: "Comparison Lab", path: "/lab", icon: Scale, description: "RAG vs GraphRAG" },
      { label: "Evaluation", path: "/evaluation", icon: FlaskConical, description: "Datasets & experiments" },
      { label: "Analytics", path: "/analytics", icon: BarChart3, description: "Usage & performance" },
    ],
  },
  {
    title: "Administration",
    items: [
      { label: "System", path: "/system", icon: Gauge, description: "Service health" },
      { label: "Settings", path: "/settings", icon: Settings, description: "Organization & workspace" },
    ],
  },
];

export const ALL_NAV_ITEMS = NAVIGATION.flatMap((section) => section.items);
