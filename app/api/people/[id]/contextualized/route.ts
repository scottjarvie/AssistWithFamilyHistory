import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { api } from "@/convex/_generated/api";
import { getAuthedConvexClient, isConvexConfigured } from "@/lib/convex/server";
import {
  getContextualizedDocument,
  getLatestRun,
  saveContextualizedDocument,
  isLocalFsEnabled,
} from "@/lib/storage/fileStorage";
import { resolveImportRunForStoredRun } from "@/lib/familysearch/importRunResolver";
import { getVaultAccessContext } from "@/lib/vault/server";
import { resolvePersonAccess } from "@/lib/vault/serverPersonAccess";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: personIdentifier } = await params;
    const { vaultOwnerId } = await getVaultAccessContext();
    const runParam = request.nextUrl.searchParams.get("run");
    let runId = runParam;
    const { vaultPerson, storagePerson, storagePersonId } = await resolvePersonAccess({
      personIdentifier,
      vaultOwnerId,
    });

    if (!runId && storagePersonId) {
      const latest = await getLatestRun(storagePersonId, vaultOwnerId);
      runId = latest?.runId || null;
    }

    if (!runId) {
      return NextResponse.json({
        success: false,
        status: vaultPerson ? "vault_only" : "no_runs",
        error: vaultPerson
          ? "This person is in the vault, but no stored extraction run is available for the legacy contextualized dossier flow yet."
          : "No runs found for this person",
        personName: storagePerson?.name || vaultPerson?.displayName || personIdentifier,
      });
    }

    // Convex is the canonical store (GEN-91). Prefer the mirrored Person Sheet
    // artifact; only fall back to the local filesystem in dev.
    let markdown: string | null = null;

    if (isConvexConfigured() && storagePersonId) {
      try {
        const existingDoc = await (await getAuthedConvexClient()).action(api.documents.getDocument, {
          vaultOwnerId,
          personId: storagePersonId,
          type: "PS",
        });
        markdown = existingDoc?.contentMarkdown ?? null;
      } catch (error) {
        console.error("Failed to read contextualized dossier from Convex:", error);
      }
    }

    if (!markdown && isLocalFsEnabled() && storagePersonId) {
      markdown = await getContextualizedDocument(storagePersonId, runId, vaultOwnerId);
    }

    if (!markdown) {
      return NextResponse.json({
        success: false,
        status: "not_generated",
        runId,
        error: "Contextualized dossier has not been generated for this run yet",
      });
    }

    const jsonBody = JSON.stringify({
      success: true,
      markdown,
      personName: storagePerson?.name || vaultPerson?.displayName || personIdentifier,
      runId,
    });
    const cacheControl = "private, max-age=0, must-revalidate";
    const etag = 'W/"' + createHash("sha1").update(jsonBody).digest("hex") + '"';
    if (request.headers.get("if-none-match") === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: { ETag: etag, "Cache-Control": cacheControl },
      });
    }
    return new NextResponse(jsonBody, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ETag: etag,
        "Cache-Control": cacheControl,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to load contextualized dossier",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: personIdentifier } = await params;
    const { vaultOwnerId } = await getVaultAccessContext();
    const body = await request.json();
    const runId = typeof body.runId === "string" ? body.runId : "";
    const markdown = typeof body.markdown === "string" ? body.markdown : "";
    const { vaultPerson, storagePerson, storagePersonId } = await resolvePersonAccess({
      personIdentifier,
      vaultOwnerId,
    });

    if (!runId || !markdown.trim()) {
      return NextResponse.json(
        { error: "Missing required fields: runId and markdown" },
        { status: 400 }
      );
    }

    if (!storagePersonId) {
      return NextResponse.json(
        {
          error:
            "This person does not have a stored extraction run yet, so the legacy contextualized dossier cannot be saved.",
        },
        { status: 400 }
      );
    }

    await saveContextualizedDocument(storagePersonId, runId, markdown, vaultOwnerId);

    let backendWarning: string | undefined;

    if (isConvexConfigured()) {
      try {
        const client = await getAuthedConvexClient();
        const importRun = await resolveImportRunForStoredRun({
          client,
          vaultOwnerId,
          personId: storagePersonId,
          runId,
          storageOwnerId: vaultOwnerId,
        });
        const artifactPath = `data/source-docs/people/${storagePersonId}/runs/${runId}/contextualized.md`;

        await client.mutation(api.documents.upsertDocument, {
          vaultOwnerId,
          personId: storagePersonId,
          importRunId: importRun.importRunId,
          type: "PS",
          title: `${storagePerson?.name || vaultPerson?.displayName || personIdentifier} Person Sheet`,
          contentMarkdown: markdown,
          artifactPath,
        });

        if (importRun.importRunId) {
          await client.mutation(api.importRuns.attachArtifactPaths, {
            vaultOwnerId,
            importRunId: importRun.importRunId,
            artifactPaths: {
              contextualizedPath: artifactPath,
            },
          });
        }

        if (importRun.personId) {
          await client.mutation(api.vaultMutations.bulkRefreshResearchChecks, {
            vaultOwnerId,
            personId: importRun.personId,
            source: "import",
          });
        }
      } catch (error) {
        console.error("Failed to mirror contextualized dossier into Convex:", error);
        backendWarning =
          error instanceof Error
            ? error.message
            : "Contextualized dossier was saved locally, but vault document sync failed.";
      }
    }

    return NextResponse.json({ success: true, runId, backendWarning });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to save contextualized dossier",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
