/**
 * GET /context-schema
 *
 * Public, unauthenticated discovery document: the canonical "what type of thing
 * goes where" map that any external AI agent reads before storing material.
 *
 * Deliberately served at the site root (NOT under /api) so it is publicly
 * reachable — every /api route is required to be in the protected route set
 * (see scripts/check-protected-routes.ts). It leaks ZERO vault data: it
 * describes the storage contract shape only.
 */
import { NextResponse } from "next/server";
import { buildContextSchemaDocument, TAXONOMY_VERSION } from "@/lib/context/taxonomy";

export async function GET() {
  return NextResponse.json(buildContextSchemaDocument(), {
    headers: {
      "Cache-Control": "public, max-age=300, must-revalidate",
      ETag: `"context-schema-${TAXONOMY_VERSION}"`,
    },
  });
}
