import { api } from "@/convex/_generated/api";
import { getAuthedConvexClient, isConvexConfigured } from "@/lib/convex/server";
import { getPerson } from "@/lib/storage/fileStorage";
import type { PersonMetadata } from "@/lib/storage/types";

interface ResolvedVaultPerson {
  _id: string;
  displayName: string;
  fsId?: string;
  routeId: string;
}

export interface ResolvedPersonAccess {
  vaultPerson: ResolvedVaultPerson | null;
  storagePerson: PersonMetadata | null;
  storagePersonId: string | null;
}

export async function resolvePersonAccess(args: {
  personIdentifier: string;
  vaultOwnerId: string;
}): Promise<ResolvedPersonAccess> {
  const { personIdentifier, vaultOwnerId } = args;
  let vaultPerson: ResolvedVaultPerson | null = null;

  if (isConvexConfigured()) {
    try {
      const workspace = await (await getAuthedConvexClient()).action(api.vaultReads.getPersonWorkspace, {
        vaultOwnerId,
        personIdentifier,
      });

      if (workspace) {
        vaultPerson = {
          _id: String(workspace.person._id),
          displayName: workspace.person.displayName,
          fsId: workspace.person.fsId,
          routeId: workspace.person.routeId,
        };
      }
    } catch {
      vaultPerson = null;
    }
  }

  const storageCandidates = Array.from(
    new Set(
      [personIdentifier, vaultPerson?.fsId]
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    )
  );

  let storagePerson: PersonMetadata | null = null;
  let storagePersonId: string | null = null;

  for (const candidate of storageCandidates) {
    const existing = await getPerson(candidate, vaultOwnerId);
    if (existing) {
      storagePerson = existing;
      storagePersonId = candidate;
      break;
    }
  }

  return {
    vaultPerson,
    storagePerson,
    storagePersonId,
  };
}
