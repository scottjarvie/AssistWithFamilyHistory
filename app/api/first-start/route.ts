import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import { getAuthedConvexClient, getConvexRuntimeIssue, isConvexConfigured } from "@/lib/convex/server";
import { getVaultAccessContext } from "@/lib/vault/server";

const PersonSchema = z.object({
  given: z.string().trim().min(1).max(100),
  surname: z.string().trim().max(100).optional(),
  living: z.boolean(),
});

const FirstStartSchema = z.object({
  operationId: z.string().trim().min(1).max(160),
  startingPerson: PersonSchema,
  relatedPerson: PersonSchema,
  relationship: z.enum(["parent", "child", "partner"]),
});

export async function POST(request: NextRequest) {
  if (!isConvexConfigured()) {
    const issue = getConvexRuntimeIssue();
    return NextResponse.json({ success: false, error: issue.title }, { status: issue.statusCode });
  }

  try {
    const parsed = FirstStartSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Check the names, relationship, and living status before saving." },
        { status: 400 },
      );
    }

    const { vaultOwnerId, mode } = await getVaultAccessContext();
    const client = await getAuthedConvexClient({ requireAuthentication: mode === "user" });
    const result = await client.mutation(api.vaultMutations.startPrivateWorkspace, {
      vaultOwnerId,
      ...parsed.data,
    });

    return NextResponse.json(
      {
        success: true,
        ...result,
        personPath: `/app/people/${result.startingPersonId}`,
      },
      { status: result.deduplicated ? 200 : 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("only available in an empty private workspace")) {
      return NextResponse.json(
        { success: false, error: "This workspace already has family-history work. Open People to continue there." },
        { status: 409 },
      );
    }
    const issue = getConvexRuntimeIssue(error);
    return NextResponse.json(
      { success: false, error: issue.title, details: "Nothing was saved. Review the form and try again." },
      { status: issue.statusCode },
    );
  }
}
