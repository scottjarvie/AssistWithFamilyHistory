import { compareValues, v } from "convex/values";
import { authorizeTenantAction, requireWebsitePerson } from "./access";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { personHistoryFields, type PersonHistoryField, type PersonHistoryPage } from "../lib/vault/personHistory";

const DETAIL_LIMIT = 64;
const PAGE_SIZE = 8;
const fieldKeys = Object.keys(personHistoryFields) as PersonHistoryField[];

export function changedPersonFields(before: Doc<"persons">, patch: Partial<Doc<"persons">>) {
  return fieldKeys.filter(key => Object.prototype.hasOwnProperty.call(patch, key) && compareValues(before[key], patch[key]) !== 0);
}

export async function appendPersonHistory(
  ctx: MutationCtx,
  event: Omit<Doc<"personHistory">, "_id" | "_creationTime" | "sequence">,
) {
  if (event.operation === "edit" && event.fields.length === 0) return;
  const changes = () => ctx.db.query("personHistory").withIndex("by_person_sequence", q => q.eq("personId", event.personId));
  const latest = await changes().order("desc").first();
  const sequence = (latest?.sequence ?? 0) + 1;
  await ctx.db.insert("personHistory", { ...event, sequence });
  if (sequence > DETAIL_LIMIT) {
    const oldest = await changes().first();
    if (oldest && oldest.sequence <= sequence - DETAIL_LIMIT) await ctx.db.delete(oldest._id);
  }
}

export async function purgePersonHistory(ctx: MutationCtx, personId: Id<"persons">) {
  const changes = await ctx.db.query("personHistory")
    .withIndex("by_person_sequence", q => q.eq("personId", personId)).take(DETAIL_LIMIT);
  for (const change of changes) await ctx.db.delete(change._id);
}

/** The auth platform verifies the token. Shadow-mode guest writes keep their
 * native behavior and supply no website attribution. */
export async function verifiedWebsiteOwner(ctx: Pick<MutationCtx, "auth">, owner: string) {
  try {
    return (await requireWebsitePerson(ctx)).subject === owner;
  } catch {
    return false;
  }
}

// Same domain separator and 48-bit display code as the campaign formatter.
// The history owner must still own the exact pinned grant row. A revoked grant
// remains a historical byline while that owner can inspect it in Settings.
async function connectionByline(ctx: QueryCtx, owner: string, grantId?: Id<"mcpGrants">) {
  const grant = grantId ? await ctx.db.get(grantId) : null;
  if (!grant || grant.vaultOwnerId !== owner || grant.hiddenAt !== undefined) return "Connected AI";
  const input = new TextEncoder().encode(JSON.stringify(["record-history:connection:v1", "family-history", owner, grant._id]));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
  const code = Array.from(digest.subarray(0, 6), byte => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `Connected AI · Connection ${code}`;
}

export function savesPerson(toolName: string) {
  return toolName === "save_person" || toolName === "save_complete_result" || toolName === "family_history_save_records";
}

async function nativeCreation(ctx: QueryCtx, person: Doc<"persons">, owner: string): Promise<PersonHistoryPage["rows"][number]> {
  const stamp = person.creationProvenance;
  const base = { at: person._creationTime, action: "Created" as const, fields: [] };
  if (person.creationRole && stamp?.method === "manual_first_start" && stamp.actorKind === "user") {
    return {
      ...base,
      at: stamp.recordedAt,
      actor: stamp.websiteActorVerified && stamp.actorId === owner ? "Vault owner" : "Writer unrecorded",
      source: "Website · First Start",
    };
  }
  if (stamp?.method === "mcp" && stamp.actorKind === "chosen_ai") {
    const receipt = await ctx.db.query("mcpOperations")
      .withIndex("by_owner_operation", q => q.eq("vaultOwnerId", owner).eq("operationId", stamp.operationId)).unique();
    const grantId = receipt && savesPerson(receipt.toolName) && receipt.clientId === stamp.actorId ? receipt.personSaveGrantId : undefined;
    return { ...base, at: stamp.recordedAt, actor: await connectionByline(ctx, owner, grantId), source: "Hosted MCP" };
  }
  return { ...base, actor: "Writer unrecorded", source: "Source unrecorded" };
}

const pageArgs = {
  vaultOwnerId: v.string(),
  personId: v.id("persons"),
  before: v.union(v.number(), v.null()),
};

export const page = action({
  args: pageArgs,
  handler: async (ctx, args): Promise<PersonHistoryPage> => {
    await requireWebsitePerson(ctx);
    const access = await authorizeTenantAction(ctx, "personHistory.page", args.vaultOwnerId, async () => {});
    if (!access.allowed || access.caller !== args.vaultOwnerId) throw new Error("Person history unavailable");
    return ctx.runQuery(internal.personHistory.pageInternal, args);
  },
});

export const pageInternal = internalQuery({
  args: pageArgs,
  handler: async (ctx, { vaultOwnerId, personId, before }): Promise<PersonHistoryPage> => {
    const person = await ctx.db.get(personId);
    if (!person || person.vaultOwnerId !== vaultOwnerId || person.archivedAt !== undefined) {
      throw new Error("Person history unavailable");
    }
    if (before !== null && (!Number.isSafeInteger(before) || before < 1)) throw new Error("Invalid history page");

    const details = await ctx.db.query("personHistory")
      .withIndex("by_owner", q => {
        const personRange = q.eq("vaultOwnerId", vaultOwnerId).eq("personId", personId);
        return before === null ? personRange : personRange.lt("sequence", before);
      }).order("desc").take(PAGE_SIZE + 1);
    const visible = details.slice(0, PAGE_SIZE);
    const rows: PersonHistoryPage["rows"] = await Promise.all(visible.map(async row => ({
      at: row.at,
      action: row.operation === "create" ? "Created" : "Edited",
      actor: row.source === "mcp" ? await connectionByline(ctx, vaultOwnerId, row.grantId) : "Vault owner",
      source: row.source === "mcp" ? "Hosted MCP" : "Website · Vault save",
      fields: row.fields,
    })));
    const hasMore = details.length > PAGE_SIZE;
    if (!hasMore && !visible.some(row => row.operation === "create")) {
      rows.push(await nativeCreation(ctx, person, vaultOwnerId));
    }
    // Person saves do not attest that a specific source supports the changed
    // fields. No evidence reference is returned or inferred from current links.
    return { rows, before: hasMore ? details[PAGE_SIZE - 1].sequence : null };
  },
});
