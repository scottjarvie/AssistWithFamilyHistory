"use server";
import { api } from "@/convex/_generated/api";
import { getAuthedConvexClient } from "@/lib/convex/server";
import { getVaultAccessContext } from "@/lib/vault/server";
export async function loadPeoplePage(input: {search?: string; researchStatus?: "not_started" | "basic" | "in_progress" | "thorough" | "complete"; cursor: string | null}) {
  const {vaultOwnerId} = await getVaultAccessContext();
  const client = await getAuthedConvexClient();
  return client.action(api.vaultReads.getPeopleExplorerPage, {...input, vaultOwnerId});
}
