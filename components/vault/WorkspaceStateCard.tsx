import type { ReactNode } from "react";
import { AlertTriangle, ArchiveX, CloudOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const WORKSPACE_LOADING_LABEL = "Loading workspace…";

export type WorkspaceStateKind = "empty" | "unavailable" | "error";

interface WorkspaceStateCardProps {
  kind: WorkspaceStateKind;
  title: string;
  description: string;
  badge?: string | null;
  actions?: ReactNode;
  density?: "default" | "compact";
  className?: string;
}

const statePresentation = {
  empty: {
    Icon: ArchiveX,
    iconClassName: "border-border bg-muted text-muted-foreground",
  },
  unavailable: {
    Icon: CloudOff,
    iconClassName: "border-annotation/30 bg-annotation-surface text-annotation",
  },
  error: {
    Icon: AlertTriangle,
    iconClassName: "border-destructive/30 bg-destructive-surface text-destructive",
  },
} satisfies Record<WorkspaceStateKind, { Icon: typeof ArchiveX; iconClassName: string }>;

export function WorkspaceStateCard({
  kind,
  title,
  description,
  badge = "Research Vault",
  actions,
  density = "default",
  className,
}: WorkspaceStateCardProps) {
  const { Icon, iconClassName } = statePresentation[kind];
  const isCompact = density === "compact";

  return (
    <Card
      data-workspace-state={kind}
      role={kind === "error" ? "alert" : undefined}
      aria-atomic={kind === "error" ? true : undefined}
      className={cn("border-dashed border-border bg-card", isCompact && "gap-4 py-4", className)}
    >
      <CardHeader className={cn(isCompact && "px-4")}>
        <div className="flex min-w-0 items-start gap-3">
          <div
            aria-hidden="true"
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-xl border",
              isCompact && "size-9 rounded-lg",
              iconClassName
            )}
          >
            <Icon className="size-5" />
          </div>
          <div className="min-w-0 space-y-2">
            {badge ? (
              <Badge variant="secondary" className="w-fit">
                {badge}
              </Badge>
            ) : null}
            <CardTitle role="heading" aria-level={2} className={cn(isCompact && "text-base")}>
              {title}
            </CardTitle>
            <CardDescription className="max-w-2xl leading-6">{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      {actions ? (
        <CardContent
          className={cn(
            "flex flex-col items-stretch gap-3 border-t border-border pt-5 sm:flex-row sm:items-center",
            isCompact && "px-4 pt-4"
          )}
        >
          {actions}
        </CardContent>
      ) : null}
    </Card>
  );
}
