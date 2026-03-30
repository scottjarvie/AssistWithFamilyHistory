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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: personId } = await params;
    const { vaultOwnerId } = await getVaultAccessContext();
    const searchParams = request.nextUrl.searchParams;
    const runId = searchParams.get("run");

    // Get the run to use
    let targetRunId = runId;
    if (!targetRunId) {
      const latest = await getLatestRun(personId, vaultOwnerId);
      targetRunId = latest?.runId || null;
    }

    if (!targetRunId) {
      return NextResponse.json(
        { error: "No runs found for this person" },
        { status: 404 }
      );
    }

    // Try to get existing raw document
    let markdown = await getRawDocument(personId, targetRunId, vaultOwnerId);

    if (!markdown) {
      // Generate from evidence pack
      const evidencePack = await getEvidencePack(personId, targetRunId, vaultOwnerId);
      
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
      await saveRawDocument(personId, targetRunId, markdown, vaultOwnerId);
    }

    // Get person name
    const person = await getPerson(personId, vaultOwnerId);

    let backendWarning: string | undefined;

    if (isConvexConfigured()) {
      try {
        const client = getConvexClient();
        const importRun = await resolveImportRunForStoredRun({
          client,
          vaultOwnerId,
          personId,
          runId: targetRunId,
          storageOwnerId: vaultOwnerId,
        });
        const artifactPath = `data/source-docs/people/${personId}/runs/${targetRunId}/raw-document.md`;

        await client.mutation(api.documents.upsertDocument, {
          vaultOwnerId,
          personId,
          importRunId: importRun.importRunId,
          type: "CST",
          title: `${person?.name || personId} Complete Source Transcription`,
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
      personName: person?.name || personId,
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
