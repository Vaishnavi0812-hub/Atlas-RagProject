import type { Role } from "@/lib/api";
import { ROLE_LABEL } from "@/lib/roles";
import { Badge } from "./Badge";

const TONE = { owner: "persimmon", admin: "cobalt", editor: "gold", viewer: "neutral" } as const;

export function RoleBadge({ role }: { role: Role }) {
  return <Badge tone={TONE[role]}>{ROLE_LABEL[role]}</Badge>;
}
