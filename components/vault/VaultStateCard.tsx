import type { ReactNode } from "react";
import { WorkspaceStateCard } from "@/components/vault/WorkspaceStateCard";

interface VaultStateCardProps {
  title: string;
  description: string;
  badge?: string;
  actions?: ReactNode;
}

export function VaultStateCard({
  title,
  description,
  badge = "Research Vault",
  actions,
}: VaultStateCardProps) {
  return (
    <WorkspaceStateCard
      kind="unavailable"
      title={title}
      description={description}
      badge={badge}
      actions={actions}
    />
  );
}
