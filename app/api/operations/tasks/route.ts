import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import { getConvexClient, getConvexRuntimeIssue, isConvexConfigured } from "@/lib/convex/server";
import { getVaultAccessContext } from "@/lib/vault/server";

// GEN-94: zod request-body contract. Priority narrows to the Convex mutation
// arg type; `.catch("medium")` preserves the prior fallback-on-invalid
// behavior. personIdentifier falls back to personFsId as before.
const PriorityEnum = z.enum(["high", "medium", "low"]).catch("medium");

const RequestSchema = z.object({
  personIdentifier: z.string().optional(),
  personFsId: z.string().optional(),
  title: z.string().transform((value) => value.trim()),
  description: z.string().optional().transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  }),
  priority: PriorityEnum.optional(),
});

export async function POST(request: NextRequest) {
  if (!isConvexConfigured()) {
    const issue = getConvexRuntimeIssue();
    return NextResponse.json({ error: issue.title, details: issue.description }, { status: issue.statusCode });
  }

  try {
    const { vaultOwnerId } = await getVaultAccessContext();
    const parsed = RequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Missing task title", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const personIdentifier = parsed.data.personIdentifier ?? parsed.data.personFsId ?? undefined;
    const { title, description } = parsed.data;
    const priority = parsed.data.priority ?? "medium";

    if (!title) {
      return NextResponse.json({ error: "Missing task title" }, { status: 400 });
    }

    const client = getConvexClient();
    const workspace = personIdentifier
      ? await client.query(api.vault.getPersonWorkspace, { vaultOwnerId, personIdentifier })
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
