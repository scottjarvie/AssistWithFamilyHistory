import type { ConvexHttpClient } from "convex/browser";
import type { FunctionArgs } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { QueueFilters } from "./viewFilters";

export function readWebsiteQueueList(client: ConvexHttpClient, args: FunctionArgs<typeof api.queue.listQueueItems>) {
  return client.action(api.queue.listQueueItems, args);
}

export function readWebsiteQueueDetail(client: ConvexHttpClient, args: FunctionArgs<typeof api.queue.getQueueItem>) {
  return client.action(api.queue.getQueueItem, args);
}

export async function loadInitialWebsiteQueue(client: ConvexHttpClient, vaultOwnerId: string, filters: QueueFilters) {
  const state = (filters.state || undefined) as FunctionArgs<typeof api.queue.listQueueItems>["state"];
  const [list, detail] = await Promise.allSettled([
    readWebsiteQueueList(client, {
      vaultOwnerId, state, suggestions: filters.suggestions === "true", archived: filters.archived === "true",
      paginationOpts: { numItems: 25, cursor: null },
    }),
    filters.item ? readWebsiteQueueDetail(client, {
      vaultOwnerId, queueItemId: filters.item as Id<"queueItems">,
      activityPagination: { numItems: 50, cursor: null },
    }) : null,
  ]);
  return {
    list: list.status === "fulfilled" ? list.value : null,
    detail: detail.status === "fulfilled" ? detail.value : null,
  };
}
