"use server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getAuthedConvexClient } from "@/lib/convex/server";
import { getVaultAccessContext } from "@/lib/vault/server";
export async function loadPeoplePage(input: {expectedOwner: string; search?: string; researchStatus?: "not_started" | "basic" | "in_progress" | "thorough" | "complete"; cursor: string | null}) {
  const {vaultOwnerId} = await getVaultAccessContext();
  if (input.expectedOwner !== vaultOwnerId) throw new Error("The active tree changed. Reload People to continue.");
  const args = {search: input.search, researchStatus: input.researchStatus, cursor: input.cursor};
  const client = await getAuthedConvexClient();
  return client.action(api.vaultReads.getPeopleExplorerPage, {...args, vaultOwnerId});
}

export async function loadPersonHistory(personId: Id<"persons">, before: number | null) {
  const { vaultOwnerId, mode } = await getVaultAccessContext();
  if (mode !== "user") throw new Error("Person history unavailable");
  const client = await getAuthedConvexClient({ requireAuthentication: true });
  return client.action(api.personHistory.page, { vaultOwnerId, personId, before });
}
