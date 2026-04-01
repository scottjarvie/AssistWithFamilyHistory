import { NextRequest, NextResponse } from "next/server";
import { getEvidencePack } from "@/lib/storage/fileStorage";
import { EvidencePackSchema } from "@/features/source-docs/lib/schemas";
import { getVaultAccessContext } from "@/lib/vault/server";
import { resolvePersonAccess } from "@/lib/vault/serverPersonAccess";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  try {
    const { id: personIdentifier, runId } = await params;
    const { vaultOwnerId } = await getVaultAccessContext();
    const { storagePersonId } = await resolvePersonAccess({ personIdentifier, vaultOwnerId });
    const evidencePack = storagePersonId
      ? await getEvidencePack(storagePersonId, runId, vaultOwnerId)
      : null;

    if (!evidencePack) {
      return NextResponse.json({ error: "Legacy source capture not found" }, { status: 404 });
    }

    const parseResult = EvidencePackSchema.safeParse(evidencePack);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Legacy source capture is invalid", details: parseResult.error.issues },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      pack: parseResult.data,
      sourceCount: parseResult.data.sources.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to load legacy source capture",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
