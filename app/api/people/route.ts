/**
 * People API Route
 * 
 * Purpose: List all imported people
 * 
 * Key Elements:
 * - GET: List all people with metadata
 * 
 * Dependencies:
 * - @/lib/storage/fileStorage
 * 
 * Last Updated: Initial setup
 */

import { NextResponse } from "next/server";
import { listPeople } from "@/lib/storage/fileStorage";
import { getVaultAccessContext } from "@/lib/vault/server";

export async function GET() {
  try {
    const { vaultOwnerId } = await getVaultAccessContext();
    const people = await listPeople(vaultOwnerId);
    
    return NextResponse.json({
      success: true,
      people,
      count: people.length,
    });
  } catch (error) {
    console.error("Error listing people:", error);
    return NextResponse.json(
      { 
        error: "Failed to list people",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
