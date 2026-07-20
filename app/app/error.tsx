"use client";

/**
 * App Error Boundary
 *
 * Purpose: Route-level error UI for /app routes. Next.js renders this
 * when a server/client component in the segment throws. Provides a
 * friendly message and a retry button that re-renders the segment.
 *
 * Notes:
 * - Must be a Client Component (Next.js requirement for error.tsx).
 * - `reset()` attempts to re-render the failed segment.
 */

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { SafeLink } from "@/components/layout/SafeLink";
import { WorkspaceStateCard } from "@/components/vault/WorkspaceStateCard";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Keep diagnostics values-safe: Next's digest is opaque, while the
    // thrown error can contain request or workspace details.
    console.error("App route error:", { digest: error.digest ?? "unavailable" });
  }, [error.digest]);

  return (
    <div className="p-6 sm:p-8">
      <WorkspaceStateCard
        kind="error"
        title="This view did not load"
        description="We could not confirm this view loaded. Try again, or return to the dashboard. Recheck the latest workspace state before repeating a save or import."
        className="mx-auto max-w-lg"
        actions={
          <>
            <Button className="min-h-11" onClick={() => reset()}>Try again</Button>
            <Button className="min-h-11" variant="outline" asChild>
              <SafeLink href="/app">Back to dashboard</SafeLink>
            </Button>
          </>
        }
      />
    </div>
  );
}
