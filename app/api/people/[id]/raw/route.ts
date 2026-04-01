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
import { api } from "@/convex/_generated/api";
import { getLatestRun, getEvidencePack, getRawDocument, saveRawDocument, getPerson } from "@/lib/storage/fileStorage";
import { getConvexClient, isConvexConfigured } from "@/lib/convex/server";
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

    // Try to get existing raw document
    let markdown = storagePersonId
      ? await getRawDocument(storagePersonId, targetRunId, vaultOwnerId)
      : null;

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

      // Save for future use
      if (storagePersonId) {
        await saveRawDocument(storagePersonId, targetRunId, markdown, vaultOwnerId);
      }
    }

    // Get person name
    const personName = storagePerson?.name || vaultPerson?.displayName || personIdentifier;

    let backendWarning: string | undefined;

    if (isConvexConfigured() && storagePersonId) {
      try {
        const client = getConvexClient();
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

    return NextResponse.json({
      success: true,
      markdown,
      personName,
      runId: targetRunId,
      backendWarning,
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
