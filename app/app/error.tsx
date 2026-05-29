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
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SafeLink } from "@/components/layout/SafeLink";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the error for diagnostics without exposing details to the UI.
    console.error("App route error:", error);
  }, [error]);

  return (
    <div className="p-6 sm:p-8">
      <Card className="mx-auto max-w-lg">
        <CardHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <CardTitle>Something went wrong</CardTitle>
          <CardDescription>
            We hit an unexpected problem loading this part of your workspace. Your data is safe — you
            can try again or head back to the dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button onClick={() => reset()}>Try again</Button>
          <Button variant="outline" asChild>
            <SafeLink href="/app">Back to dashboard</SafeLink>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
