import type { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { getCapturePackage } from "@/lib/storage/fileStorage";

interface ResolveImportRunOptions {
  client: ConvexHttpClient;
  vaultOwnerId: string;
  personId: string;
  runId: string;
  storageOwnerId?: string;
}

export async function resolveImportRunForStoredRun({
  client,
  vaultOwnerId,
  personId,
  runId,
  storageOwnerId,
}: ResolveImportRunOptions) {
  const capture = await getCapturePackage(personId, runId, storageOwnerId);
  const captureId =
    capture &&
    typeof capture === "object" &&
    "captureId" in capture &&
    typeof capture.captureId === "string"
      ? capture.captureId
      : null;

  if (captureId) {
    const importRun = await client.query(api.importRuns.getByCaptureId, {
      captureId,
      vaultOwnerId,
    });

    if (importRun) {
      return {
        importRunId: importRun._id,
        personId: importRun.personId,
        captureId,
      };
    }
  }

  const latestImport = await client.query(api.importRuns.listRecent, {
    vaultOwnerId,
    personFsId: personId,
    limit: 1,
  });

  return {
    importRunId: latestImport[0]?._id ?? undefined,
    personId: latestImport[0]?.personId,
    captureId,
  };
}
