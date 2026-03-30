import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getConvexClient, isConvexConfigured } from "@/lib/convex/server";
import {
  getContextualizedDocument,
  getLatestRun,
  getPerson,
  saveContextualizedDocument,
} from "@/lib/storage/fileStorage";
import { resolveImportRunForStoredRun } from "@/lib/familysearch/importRunResolver";
import { getVaultAccessContext } from "@/lib/vault/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: personId } = await params;
    const { vaultOwnerId } = await getVaultAccessContext();
    const runParam = request.nextUrl.searchParams.get("run");
    let runId = runParam;

    if (!runId) {
      const latest = await getLatestRun(personId, vaultOwnerId);
      runId = latest?.runId || null;
    }

    if (!runId) {
      return NextResponse.json({
        success: false,
        status: "no_runs",
        error: "No runs found for this person",
      });
    }

    const markdown = await getContextualizedDocument(personId, runId, vaultOwnerId);
    if (!markdown) {
      return NextResponse.json({
        success: false,
        status: "not_generated",
        runId,
        error: "Contextualized dossier has not been generated for this run yet",
      });
    }

    const person = await getPerson(personId, vaultOwnerId);
    return NextResponse.json({
      success: true,
      markdown,
      personName: person?.name || personId,
      runId,
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
    const { id: personId } = await params;
    const { vaultOwnerId } = await getVaultAccessContext();
    const body = await request.json();
    const runId = typeof body.runId === "string" ? body.runId : "";
    const markdown = typeof body.markdown === "string" ? body.markdown : "";

    if (!runId || !markdown.trim()) {
      return NextResponse.json(
        { error: "Missing required fields: runId and markdown" },
        { status: 400 }
      );
    }

    await saveContextualizedDocument(personId, runId, markdown, vaultOwnerId);

    let backendWarning: string | undefined;

    if (isConvexConfigured()) {
      try {
        const client = getConvexClient();
        const person = await getPerson(personId, vaultOwnerId);
        const importRun = await resolveImportRunForStoredRun({
          client,
          vaultOwnerId,
          personId,
          runId,
          storageOwnerId: vaultOwnerId,
        });
        const artifactPath = `data/source-docs/people/${personId}/runs/${runId}/contextualized.md`;

        await client.mutation(api.documents.upsertDocument, {
          vaultOwnerId,
          personId,
          importRunId: importRun.importRunId,
          type: "PS",
          title: `${person?.name || personId} Person Sheet`,
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
