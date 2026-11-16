"use server";
import { api } from "@/convex/_generated/api";
import { getAuthedConvexClient } from "@/lib/convex/server";
import { getVaultAccessContext } from "@/lib/vault/server";
import { projectResearchTask, projectResearchLog } from "@/lib/vault/collectionRows";
export async function loadResearchTasks(input: {expectedOwner: string; search?: string; status?: "todo" | "in_progress" | "blocked" | "done"; cursor: string | null}) {
  const {vaultOwnerId} = await getVaultAccessContext();
  if (vaultOwnerId !== input.expectedOwner) throw new Error("The active tree changed. Reload Research.");
  const client = await getAuthedConvexClient();
  const {expectedOwner: _owner, ...args} = input; void _owner;
  const result = await client.action(api.vaultReads.getResearchTasksPage, {...args, vaultOwnerId});
  return {...result, page: result.page.map(projectResearchTask)};
}
export async function loadResearchLog(input: {expectedOwner: string; cursor: string | null}) {
  const {vaultOwnerId} = await getVaultAccessContext();
  if (vaultOwnerId !== input.expectedOwner) throw new Error("The active tree changed. Reload Research.");
  const client = await getAuthedConvexClient();
  const result = await client.action(api.vaultReads.getResearchLogPage, {vaultOwnerId, cursor: input.cursor});
  return {...result, page: result.page.map(projectResearchLog)};
}
