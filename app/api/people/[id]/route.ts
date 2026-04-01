/**
 * Person API Route
 * 
 * Purpose: Get details for a specific person
 * 
 * Key Elements:
 * - GET: Get person metadata and runs
 * 
 * Dependencies:
 * - @/lib/storage/fileStorage
 * 
 * Last Updated: Initial setup
 */

import { NextRequest, NextResponse } from "next/server";
import { getLatestRun, listRuns } from "@/lib/storage/fileStorage";
import { getVaultAccessContext } from "@/lib/vault/server";
import { resolvePersonAccess } from "@/lib/vault/serverPersonAccess";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: personIdentifier } = await params;
    const { vaultOwnerId } = await getVaultAccessContext();

    const { vaultPerson, storagePerson, storagePersonId } = await resolvePersonAccess({
      personIdentifier,
      vaultOwnerId,
    });

    if (!vaultPerson && !storagePerson) {
      return NextResponse.json(
        { error: "Person not found" },
        { status: 404 }
      );
    }

    const runs = storagePersonId ? await listRuns(storagePersonId, vaultOwnerId) : [];
    const latest = storagePersonId ? await getLatestRun(storagePersonId, vaultOwnerId) : null;

    return NextResponse.json({
      success: true,
      person:
        storagePerson ||
        (vaultPerson
          ? {
              familySearchId: vaultPerson.fsId,
              name: vaultPerson.displayName,
              createdAt: "",
              updatedAt: "",
            }
          : null),
      routeId: vaultPerson?.routeId || personIdentifier,
      vaultOnly: Boolean(vaultPerson && !storagePerson),
      hasStoredRun: Boolean(latest),
      runs,
      latestRunId: latest?.runId,
    });
  } catch (error) {
    console.error("Error getting person:", error);
    return NextResponse.json(
      { 
        error: "Failed to get person",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
