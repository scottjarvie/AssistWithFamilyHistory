/**
 * App Loading State
 *
 * Purpose: Route-level loading skeleton shown while any /app route's
 * server component is streaming. Roughly matches the common
 * "page header + card/table" layout used across the workspace.
 *
 * Notes:
 * - Pure presentational skeleton; no data access.
 * - Uses Tailwind animate-pulse on neutral stone blocks to stay
 *   consistent with the existing shadcn/Tailwind styling.
 */

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { WORKSPACE_LOADING_LABEL } from "@/components/vault/WorkspaceStateCard";

function Bar({ className }: { className?: string }) {
  return <div className={`rounded bg-stone-200 ${className ?? ""}`} />;
}

export default function AppLoading() {
  return (
    <>
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {WORKSPACE_LOADING_LABEL}
      </p>
      <div className="motion-safe:animate-pulse p-6 sm:p-8" aria-hidden="true">

        {/* Page header */}
        <div className="mb-8 space-y-3">
          <Bar className="h-7 w-56" />
          <Bar className="h-4 w-80 max-w-full" />
        </div>

        {/* Card grid (matches dashboard/people/operations card layouts) */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Card key={index}>
              <CardHeader className="gap-3">
                <Bar className="h-9 w-9 rounded-lg" />
                <Bar className="h-5 w-32" />
                <Bar className="h-4 w-full" />
              </CardHeader>
              <CardContent className="space-y-2">
                <Bar className="h-4 w-3/4" />
                <Bar className="h-4 w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Table-ish block (matches list-heavy routes) */}
        <div className="mt-8 space-y-2">
          <Bar className="h-10 w-full rounded-lg" />
          {Array.from({ length: 5 }).map((_, index) => (
            <Bar key={index} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </>
  );
}
