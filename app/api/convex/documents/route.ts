/**
 * Convex Documents API Route
 *
 * Purpose: Fetch documents for a person (PS/CST) from Convex
 */

import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getAuthedConvexClient, isConvexConfigured } from "@/lib/convex/server";
import { getVaultAccessContext } from "@/lib/vault/server";

const isDocumentType = (value: string | null): value is "PS" | "CST" =>
  value === "PS" || value === "CST";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const personId = searchParams.get("personId");
  const typeParam = searchParams.get("type");

  if (!personId) {
    return NextResponse.json(
      { error: "Missing personId" },
      { status: 400 }
    );
  }

  const type = typeParam && isDocumentType(typeParam) ? typeParam : null;

  if (typeParam && !type) {
    return NextResponse.json(
      { error: "Invalid document type" },
      { status: 400 }
    );
  }

  if (!isConvexConfigured()) {
    return NextResponse.json(
      {
        success: false,
        configured: false,
        error:
          "Documents storage is not configured. Set NEXT_PUBLIC_CONVEX_URL to enable PS/CST documents.",
        ...(type ? { document: null } : { documents: [] }),
      },
      { status: 200 }
    );
  }

  try {
    const client = await getAuthedConvexClient();
    const { vaultOwnerId } = await getVaultAccessContext();

    if (type) {
      const document = await client.action(api.documents.getDocument, {
        vaultOwnerId,
        personId,
        type,
      });

      return NextResponse.json({
        success: true,
        document,
      });
    }

    const documents = await client.action(api.documents.getDocumentsByPerson, {
      vaultOwnerId,
      personId,
    });

    return NextResponse.json({
      success: true,
      documents,
    });
  } catch (error) {
    console.error("Convex documents error:", error);
    return NextResponse.json(
      { error: "Failed to load documents" },
      { status: 500 }
    );
  }
}
