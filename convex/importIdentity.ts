import type { Doc, TableNames } from "./_generated/dataModel";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { isGedcomSystem } from "../lib/treeImport/model";
import { matchesVaultOwner } from "./vaultCore";

/** A caller's old bookkeeping key alone never proves an outside identity. */
export async function legacyExternalIdentityIsVerified(
  ctx: QueryCtx | MutationCtx, owner: string, mapping: Doc<"mcpRecordKeys">,
  table: TableNames, system: string, key: string, fileScope?: string,
): Promise<boolean> {
  if (mapping.externalKeyVersion === 2) return true;
  if (mapping.externalKeyVersion !== undefined) return false;
  const id = ctx.db.normalizeId(table, mapping.recordId);
  const value = id ? await ctx.db.get(id) : null;
  const row = value as unknown as {
    vaultOwnerId?: string; fsId?: string; familySearchId?: string;
    externalIds?: Array<{ system: string; id: string }>;
    creationProvenance?: { method: string }; importJobId?: string;
  } | null;
  if (!row || !matchesVaultOwner(row.vaultOwnerId, owner)) return false;
  const normalizedSystem = system.trim().toLowerCase();
  let importOrigin = false;
  if (row.creationProvenance?.method === "import" && row.importJobId) {
    const jobId = ctx.db.normalizeId("treeImports", row.importJobId);
    const job = jobId ? await ctx.db.get(jobId) : null;
    importOrigin = !!job && job.vaultOwnerId === owner
      && (isGedcomSystem(system) ? isGedcomSystem(job.system) && job.importKey === fileScope : job.system.trim().toLowerCase() === normalizedSystem);
  }
  // A raw GEDCOM xref cannot establish its file scope without the original job.
  if (isGedcomSystem(system)) return importOrigin;
  if (normalizedSystem === "familysearch") {
    if ((table === "persons" || table === "sources") && row.fsId === key) return true;
    if (table === "relationships" && row.familySearchId === key) return true;
  }
  return importOrigin || !!row.externalIds?.some(external => external.system.trim().toLowerCase() === normalizedSystem && external.id.trim() === key.trim());
}

/** Scope legacy relationship PID lookups before applying the duplicate bound. */
export async function ownedFamilySearchRelationships(ctx: QueryCtx | MutationCtx, owner: string, key: string, limit = 2) {
  const owners = matchesVaultOwner(undefined, owner) ? [owner, undefined] : [owner];
  return (await Promise.all(owners.map(vaultOwnerId => ctx.db.query("relationships")
    .withIndex("by_owner_familySearchId", q => q.eq("vaultOwnerId", vaultOwnerId).eq("familySearchId", key)).take(limit)))).flat();
}

/** Alias registration records the canonical PID observed, without rewrite authority. */
export function relationshipPidAgrees(row: Doc<"relationships">, key: string, baseline?: Record<string, unknown> | null): boolean {
  const witness = baseline?._relationshipIdentity;
  if (witness && typeof witness === "object" && Object.hasOwn(witness, "familySearchId")) {
    const id = (witness as { familySearchId?: unknown }).familySearchId;
    return (typeof id === "string" || id === null) && (row.familySearchId ?? null) === id;
  }
  // An older primary mapping can still be verified directly. An older alias
  // without a canonical-ID witness is deliberately left for identity review.
  return row.familySearchId === key;
}
