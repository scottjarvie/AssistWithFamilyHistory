"use server";
import {api} from "@/convex/_generated/api";
import {getAuthedConvexClient} from "@/lib/convex/server";
import {getVaultAccessContext} from "@/lib/vault/server";
import {projectStoryRow} from "@/lib/vault/collectionRows";

export async function loadStories(cursor: string, expectedOwner: string) {
  const {vaultOwnerId} = await getVaultAccessContext();
  if (vaultOwnerId !== expectedOwner) throw new Error("The active vault changed. Reload Stories.");
  const client = await getAuthedConvexClient();
  const result = await client.action(api.vaultReads.getStoriesIndex, {vaultOwnerId, cursor});
  return {...result, page: result.page.map(projectStoryRow)};
}
