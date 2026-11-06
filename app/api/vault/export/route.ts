/**
 * GET /api/vault/export — the person's whole workspace as one JSON file.
 *
 * Streams table by table, 200 rows at a time, through the owner-checked
 * `yourData.exportPage` action, so a 5,000-person tree never has to fit in
 * one Convex read. Private by construction: the route is under the protected
 * `/api/vault` prefix, the owner comes from the verified session, and the
 * response is never cached.
 *
 * Files (photos, scans) are listed as records; their bytes are not inside
 * the JSON.
 */
import { api } from "@/convex/_generated/api";
import { EXPORT_TABLES } from "@/lib/vault/exportTables";
import { getAuthedConvexClient, isConvexConfigured } from "@/lib/convex/server";
import { getVaultAccessContext } from "@/lib/vault/server";

import { createExportStream } from "@/lib/vault/exportStream";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isConvexConfigured()) {
    return new Response(JSON.stringify({ error: "export_unavailable" }), { status: 503, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  }
  const access = await getVaultAccessContext();
  if (access.mode === "anonymous") {
    return new Response(JSON.stringify({ error: "sign_in_required" }), { status: 401, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  }
  const client = await getAuthedConvexClient({ requireAuthentication: access.mode === "user" });
  const exportedAt = new Date().toISOString();

  const stream = createExportStream(EXPORT_TABLES, exportedAt, (table, cursor) =>
    client.action(api.yourData.exportPage, { vaultOwnerId: access.vaultOwnerId, table, cursor }),
  );

  const day = exportedAt.slice(0, 10);
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="assist-with-family-history-${day}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
