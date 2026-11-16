"use server";
import { api } from "@/convex/_generated/api";
import { getAuthedConvexClient } from "@/lib/convex/server";
import { getVaultAccessContext } from "@/lib/vault/server";
import { projectWritingCandidate } from "@/lib/vault/collectionRows";
export async function loadWritingCandidates(cursor: string, expectedOwner: string) {
    const { vaultOwnerId } = await getVaultAccessContext();
    if (vaultOwnerId !== expectedOwner)
        throw new Error("The active vault changed. Reload Story Writer.");
    const p = await (await getAuthedConvexClient()).action(api.vaultReads.getStoryReadinessPage, { vaultOwnerId, cursor });
    return { ...p, page: p.page.map(projectWritingCandidate) };
}
