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
  const encoder = new TextEncoder();
  const exportedAt = new Date().toISOString();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (text: string) => controller.enqueue(encoder.encode(text));
      try {
        write(`{"product":"Assist With Family History","format":"awfh-export-1","exportedAt":${JSON.stringify(exportedAt)},`);
        write(`"note":"Every record in your private workspace, with who made it and when. Files are listed as records; download originals from each record.","tables":{`);
        for (const [tableIndex, table] of EXPORT_TABLES.entries()) {
          write(`${tableIndex ? "," : ""}${JSON.stringify(table)}:[`);
          let cursor: string | null = null;
          let first = true;
          do {
            const page: { rows: unknown[]; cursor: string | null } = await client.action(api.yourData.exportPage, {
              vaultOwnerId: access.vaultOwnerId,
              table,
              cursor,
            });
            for (const row of page.rows) {
              write(`${first ? "" : ","}${JSON.stringify(row)}`);
              first = false;
            }
            cursor = page.cursor;
          } while (cursor);
          write("]");
        }
        write("}}");
        controller.close();
      } catch {
        // A half-written file must not look complete: end it unparseable.
        write(`\n{"error":"export_interrupted"}`);
        controller.close();
      }
    },
  });

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
