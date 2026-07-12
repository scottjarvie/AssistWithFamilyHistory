import { NextRequest, NextResponse } from "next/server";
import { generateRawDocument } from "@/features/source-docs/lib/rawDocGenerator";
import {
  getAuthedConvexClient,
  getConvexReadyStatus,
  getConvexRuntimeIssue,
  isConvexConfigured,
} from "@/lib/convex/server";
import { assessCapturePackageForImport, parseCapturePackage } from "@/lib/familysearch/capture";
import { buildCaptureImportReview } from "@/lib/familysearch/importReview";
import { importCapturePackageToConvex } from "@/lib/familysearch/importer";
import {
  getPerson,
  saveCapturePackage,
  saveEvidencePack,
  savePerson,
  saveRawDocument,
  setLatestRun,
} from "@/lib/storage/fileStorage";
import type { PersonMetadata } from "@/lib/storage/types";
import { getVaultAccessContext } from "@/lib/vault/server";

export async function POST(request: NextRequest) {
  try {
    const { vaultOwnerId } = await getVaultAccessContext();
    const body = await request.json();
    const parsed = parseCapturePackage(body);
    const { capture, legacyEvidencePack, compatibilityMode } = parsed;
    const readiness = assessCapturePackageForImport(capture, { compatibilityMode });
    const review = buildCaptureImportReview({ capture, readiness, compatibilityMode });
    const isPreview = request.nextUrl.searchParams.get("preview") === "true";

    if (isPreview) {
      return NextResponse.json({
        success: true,
        preview: true,
        canImport: readiness.canImport,
        compatibilityMode,
        personId: capture.person.familySearchId,
        personName: capture.person.name,
        pageType: capture.pageType,
        sourceCount: capture.sources.length,
        memoryCount: capture.memories.length,
        validation: readiness,
        review,
      });
    }

    if (!readiness.canImport) {
      return NextResponse.json(
        {
          error: "Capture package failed import safety checks",
          validation: readiness,
          review,
        },
        { status: 400 }
      );
    }

    const personId = capture.person.familySearchId;
    const runId = new Date(capture.capturedAt).toISOString().replace(/[:.]/g, "-");
    const existingPerson = await getPerson(personId, vaultOwnerId);
    const now = new Date().toISOString();

    const personMetadata: PersonMetadata = {
      familySearchId: personId,
      name: capture.person.name,
      birthDate: capture.person.birthDate,
      deathDate: capture.person.deathDate,
      createdAt: existingPerson?.createdAt || now,
      updatedAt: now,
    };

    await savePerson(personMetadata, vaultOwnerId);

    const capturePackagePath = await saveCapturePackage(personId, runId, capture, vaultOwnerId);
    let evidencePackPath: string | undefined;
    let rawDocumentPath: string | undefined;

    if (legacyEvidencePack) {
      evidencePackPath = await saveEvidencePack(personId, runId, legacyEvidencePack, vaultOwnerId);
      const rawDocument = generateRawDocument(legacyEvidencePack);
      await saveRawDocument(personId, runId, rawDocument, vaultOwnerId);
      rawDocumentPath = `${evidencePackPath}/raw-document.md`;
    }

    await setLatestRun(personId, runId, vaultOwnerId);

    let importResult = null;
    let backendIssue = !isConvexConfigured() ? getConvexRuntimeIssue() : null;
    if (isConvexConfigured()) {
      try {
        importResult = await importCapturePackageToConvex({
          client: await getAuthedConvexClient(),
          vaultOwnerId,
          capture,
          compatibilityMode,
          artifactPaths: {
            capturePackagePath,
            evidencePackPath,
            rawDocumentPath,
          },
        });
      } catch (error) {
        console.error("Convex import merge failed:", error);
        backendIssue = getConvexRuntimeIssue(error);
      }
    }

    const backendStatus = backendIssue ?? getConvexReadyStatus();
    const responseWarnings = [...readiness.warnings, ...(importResult?.warnings ?? [])];

    if (backendIssue) {
      responseWarnings.push(
        `Structured vault merge is pending. Raw artifacts were saved, but the Convex backend still needs attention: ${backendIssue.description}`
      );
    }

    return NextResponse.json({
      success: true,
      compatibilityMode,
      personId,
      runId,
      pageType: capture.pageType,
      sourceCount: capture.sources.length,
      memoryCount: capture.memories.length,
      importRunId: importResult?.importRunId ?? null,
      mergeStatus: importResult?.mergeStatus ?? "partial",
      warnings: responseWarnings,
      validation: readiness,
      review: {
        ...review,
        warnings: responseWarnings,
      },
      backendState: backendStatus.state,
      backendTitle: backendStatus.title,
      backendDescription: backendStatus.description,
      vaultMerged: Boolean(importResult),
    });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json(
      {
        error: "Failed to import FamilySearch capture",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
