"use server";
import { api } from "@/convex/_generated/api";
import { getAuthedConvexClient } from "@/lib/convex/server";
import { getVaultAccessContext } from "@/lib/vault/server";
import { projectOperationRow, type OperationFilters } from "@/lib/vault/operationsRows";
import { operationQueryArguments } from "@/lib/operations/query";
export async function loadOperations(cursor: string, expectedOwner: string, filters: OperationFilters) {
    const { vaultOwnerId } = await getVaultAccessContext();
    if (vaultOwnerId !== expectedOwner)
        throw new Error("The active vault changed. Reload Operations.");
    const result = await (await getAuthedConvexClient()).action(api.vaultReads.getOperationsQueue, { vaultOwnerId, cursor, ...operationQueryArguments(filters) });
    return { ...result, rows: result.rows.map(projectOperationRow) };
}
