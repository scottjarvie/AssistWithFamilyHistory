import { revalidatePath } from "next/cache";
import { api } from "@/convex/_generated/api";
import { getAuthedConvexClient } from "@/lib/convex/server";
import { getVaultAccessContext } from "@/lib/vault/server";
import { SafeLink } from "@/components/layout/SafeLink";

export const dynamic = "force-dynamic";
export default async function ArchivePage() {
  const { vaultOwnerId } = await getVaultAccessContext();
  const client = await getAuthedConvexClient();
  const rows = await client.action(api.yourData.getArchive, { vaultOwnerId });
  async function restore(form: FormData) {
    "use server";
    const { vaultOwnerId } = await getVaultAccessContext();
    const client = await getAuthedConvexClient();
    const table = form.get("table") as typeof rows[number]["table"];
    await client.mutation(api.mcpFamilyHistory.restoreArchivedRecord, {
      vaultOwnerId, table, id: String(form.get("id")), expectedUpdatedAt: Number(form.get("updatedAt")),
    });
    revalidatePath("/app", "layout");
  }
  return <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-8">
    <h1 className="font-serif text-3xl">Archive</h1>
    <p>Archived records and their evidence stay here until restored. Nothing here is permanently deleted. Showing up to 100 records of each kind.</p>
    <SafeLink href="/app/library" className="inline-flex min-h-11 items-center text-primary underline">Back to Library</SafeLink>
    {!rows.length && <p>Your Archive is empty.</p>}
    <ul className="divide-y divide-border">{rows.map(row => <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
      <div><p className="font-medium">{row.title || row.table}</p><p className="text-sm text-muted-foreground">{row.table} · archived by {row.archivedBy} on {new Date(row.archivedAt).toLocaleDateString("en-US")}</p></div>
      <form action={restore}><input type="hidden" name="table" value={row.table}/><input type="hidden" name="id" value={row.id}/><input type="hidden" name="updatedAt" value={row.updatedAt}/><button className="min-h-11 rounded border border-border px-4" type="submit">Restore</button></form>
    </li>)}</ul>
  </div>;
}
