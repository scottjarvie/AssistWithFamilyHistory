import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getConvexClient, getConvexRuntimeIssue, isConvexConfigured } from "@/lib/convex/server";
import { getVaultAccessContext } from "@/lib/vault/server";

function isPriority(value: unknown): value is "high" | "medium" | "low" {
  return value === "high" || value === "medium" || value === "low";
}

export async function POST(request: NextRequest) {
  if (!isConvexConfigured()) {
    const issue = getConvexRuntimeIssue();
    return NextResponse.json({ error: issue.title, details: issue.description }, { status: issue.statusCode });
  }

  try {
    const { vaultOwnerId } = await getVaultAccessContext();
    const body = await request.json();
    const personFsId = typeof body.personFsId === "string" ? body.personFsId : undefined;
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : undefined;
    const priority = isPriority(body.priority) ? body.priority : "medium";

    if (!title) {
      return NextResponse.json({ error: "Missing task title" }, { status: 400 });
    }

    const client = getConvexClient();
    const workspace = personFsId
      ? await client.query(api.vault.getPersonWorkspace, { vaultOwnerId, personFsId })
      : null;

    const result = await client.mutation(api.vaultMutations.createResearchTask, {
      vaultOwnerId,
      personId: workspace?.person._id,
      title,
      description,
      priority,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);
    return NextResponse.json({ error: issue.title, details: issue.description }, { status: issue.statusCode });
  }
}

