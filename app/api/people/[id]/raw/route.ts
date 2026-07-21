/**
 * Raw Document API Route
 * 
 * Purpose: Generate and serve raw document for a person
 * 
 * Key Elements:
 * - GET: Generate raw document from evidence pack
 * 
 * Dependencies:
 * - @/lib/storage/fileStorage
 * - @/features/source-docs/lib/rawDocGenerator
 * - @/features/source-docs/lib/schemas
 * 
 * Last Updated: Initial setup
 */

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { api } from "@/convex/_generated/api";
import {
  getLatestRun,
  getEvidencePack,
  getRawDocument,
  saveRawDocument,
  isLocalFsEnabled,
} from "@/lib/storage/fileStorage";
import { getAuthedConvexClient, isConvexConfigured } from "@/lib/convex/server";
import { generateRawDocument } from "@/features/source-docs/lib/rawDocGenerator";
import { EvidencePackSchema } from "@/features/source-docs/lib/schemas";
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
    const searchParams = request.nextUrl.searchParams;
    const runId = searchParams.get("run");
    const { vaultPerson, storagePerson, storagePersonId } = await resolvePersonAccess({
      personIdentifier,
      vaultOwnerId,
    });

    // Get the run to use
    let targetRunId = runId;
    if (!targetRunId && storagePersonId) {
      const latest = await getLatestRun(storagePersonId, vaultOwnerId);
      targetRunId = latest?.runId || null;
    }

    if (!targetRunId) {
      return NextResponse.json(
        {
          error: vaultPerson
            ? "This person is in the vault, but no stored extraction run is available for the legacy raw document flow yet."
            : "No runs found for this person",
          status: vaultPerson ? "vault_only" : "no_runs",
          personName: storagePerson?.name || vaultPerson?.displayName || personIdentifier,
        },
        { status: 404 }
      );
    }

    // Convex is the canonical store (GEN-91). Prefer the mirrored artifact from
    // the documents table; only fall back to the local filesystem in dev.
    let markdown: string | null = null;

    if (isConvexConfigured() && storagePersonId) {
      try {
        const existingDoc = await (await getAuthedConvexClient()).action(api.documents.getDocument, {
          vaultOwnerId,
          personId: storagePersonId,
          type: "CST",
        });
        markdown = existingDoc?.contentMarkdown ?? null;
      } catch (error) {
        console.error("Failed to read raw document from Convex:", error);
      }
    }

    if (!markdown && isLocalFsEnabled() && storagePersonId) {
      markdown = await getRawDocument(storagePersonId, targetRunId, vaultOwnerId);
    }

    // Track whether we generated the artifact on this request. We only mirror /
    // refresh research checks for NEWLY generated artifacts — never on a pure
    // cache-hit read (GEN-90).
    let generated = false;

    if (!markdown) {
      // Generate from evidence pack
      const evidencePack = storagePersonId
        ? await getEvidencePack(storagePersonId, targetRunId, vaultOwnerId)
        : null;

      if (!evidencePack) {
        return NextResponse.json(
          { error: "Evidence pack not found" },
          { status: 404 }
        );
      }

      // Validate and generate
      const parseResult = EvidencePackSchema.safeParse(evidencePack);

      if (!parseResult.success) {
        return NextResponse.json(
          { error: "Invalid legacy source capture format" },
          { status: 500 }
        );
      }

      markdown = generateRawDocument(parseResult.data);
      generated = true;

      // Save for future use (local dev mirror only; gated inside saveRawDocument)
      if (storagePersonId) {
        await saveRawDocument(storagePersonId, targetRunId, markdown, vaultOwnerId);
      }
    }

    // Get person name
    const personName = storagePerson?.name || vaultPerson?.displayName || personIdentifier;

    let backendWarning: string | undefined;

    // Only mirror into Convex + refresh research checks when the artifact was
    // newly generated. A cache-hit read must not write (GEN-90).
    if (generated && isConvexConfigured() && storagePersonId) {
      try {
        const client = await getAuthedConvexClient();
        const importRun = await resolveImportRunForStoredRun({
          client,
          vaultOwnerId,
          personId: storagePersonId,
          runId: targetRunId,
          storageOwnerId: vaultOwnerId,
        });
        const artifactPath = `data/source-docs/people/${storagePersonId}/runs/${targetRunId}/raw-document.md`;

        await client.mutation(api.documents.upsertDocument, {
          vaultOwnerId,
          personId: storagePersonId,
          importRunId: importRun.importRunId,
          type: "CST",
          title: `${personName} Complete Source Transcription`,
          contentMarkdown: markdown,
          artifactPath,
        });

        if (importRun.importRunId) {
          await client.mutation(api.importRuns.attachArtifactPaths, {
            vaultOwnerId,
            importRunId: importRun.importRunId,
            artifactPaths: {
              rawDocumentPath: artifactPath,
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
        console.error("Failed to mirror raw document into Convex:", error);
        backendWarning =
          error instanceof Error
            ? error.message
            : "Raw document was generated locally, but vault document sync failed.";
      }
    }

    const jsonBody = JSON.stringify({
      success: true,
      markdown,
      personName,
      runId: targetRunId,
      backendWarning,
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
    console.error("Error generating raw document:", error);
    return NextResponse.json(
      { 
        error: "Failed to generate raw document",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
