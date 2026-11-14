"use server";
import { api } from "@/convex/_generated/api";
import { getAuthedConvexClient } from "@/lib/convex/server";
import { getVaultAccessContext } from "@/lib/vault/server";
export async function loadPeoplePage(input: {expectedOwner: string; search?: string; researchStatus?: "not_started" | "basic" | "in_progress" | "thorough" | "complete"; cursor: string | null}) {
  const {vaultOwnerId} = await getVaultAccessContext();
  if (input.expectedOwner !== vaultOwnerId) throw new Error("The active tree changed. Reload People to continue.");
  const args = {search: input.search, researchStatus: input.researchStatus, cursor: input.cursor};
  const client = await getAuthedConvexClient();
  return client.action(api.vaultReads.getPeopleExplorerPage, {...args, vaultOwnerId});
}
