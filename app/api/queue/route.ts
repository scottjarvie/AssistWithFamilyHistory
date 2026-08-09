import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getAuthedConvexClient, getConvexRuntimeIssue, isConvexConfigured } from "@/lib/convex/server";
import { getVaultAccessContext } from "@/lib/vault/server";

const ContextSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("person"), refId: z.string().min(1) }),
  z.object({ kind: z.literal("relationship"), refId: z.string().min(1) }),
  z.object({ kind: z.literal("place"), refId: z.string().min(1) }),
  z.object({ kind: z.literal("event"), refId: z.string().min(1) }),
  z.object({ kind: z.literal("source"), refId: z.string().min(1) }),
  z.object({ kind: z.literal("citation"), refId: z.string().min(1) }),
  z.object({ kind: z.literal("media"), refId: z.string().min(1) }),
  z.object({ kind: z.literal("context_item"), refId: z.string().min(1) }),
  z.object({ kind: z.literal("research_task"), refId: z.string().min(1) }),
  z.object({ kind: z.literal("research_check"), refId: z.string().min(1) }),
  z.object({ kind: z.literal("story"), refId: z.string().min(1) }),
  z.object({ kind: z.literal("import_run"), refId: z.string().min(1) }),
  z.object({ kind: z.literal("provisional_relative"), refId: z.string().min(1) }),
]);

const CreateQueueItemSchema = z.object({
  directive: z.string().min(1).max(4_000),
  requestedOutcome: z.string().max(1_000).optional(),
  priority: z.enum(["high", "normal", "low"]).optional(),
  priorityReason: z.string().max(500).optional(),
  context: z.array(ContextSchema).max(20).optional(),
  chosenAiId: z.string().max(160).optional(),
  handoffExpiresAt: z.number().int().positive().optional(),
  maxRetries: z.number().int().min(0).max(10).optional(),
  idempotencyKey: z.string().min(1).max(160),
});

function backendUnavailable() {
  const issue = getConvexRuntimeIssue();
  return NextResponse.json(
    {
      success: false,
      surfaceState: "error",
      error: issue.title,
      details: issue.description,
    },
    { status: issue.statusCode },
  );
}

export async function GET(request: NextRequest) {
  if (!isConvexConfigured()) return backendUnavailable();
  try {
    const { vaultOwnerId } = await getVaultAccessContext();
    const state = request.nextUrl.searchParams.get("state");
    const priority = request.nextUrl.searchParams.get("priority");
    const parsedLimit = Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "25", 10);
    const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(parsedLimit, 50)) : 25;
    const client = await getAuthedConvexClient();
    const page = await client.action(api.queue.listQueueItems, {
      vaultOwnerId,
      state:
        state === "needs_you" || state === "working" || state === "waiting_for_your_ai" || state === "done"
          ? state
          : undefined,
      priority: priority === "high" || priority === "normal" || priority === "low" ? priority : undefined,
      paginationOpts: {
        numItems: limit,
        cursor: request.nextUrl.searchParams.get("cursor"),
      },
    });
    return NextResponse.json({
      success: true,
      surfaceState: page.page.length === 0 ? "empty" : "ready",
      ...page,
    });
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);
    return NextResponse.json(
      { success: false, surfaceState: issue.statusCode === 403 ? "permission_denied" : "error", error: issue.title, details: issue.description },
      { status: issue.statusCode },
    );
  }
}

export async function POST(request: NextRequest) {
  if (!isConvexConfigured()) return backendUnavailable();
  try {
    const parsed = CreateQueueItemSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, surfaceState: "error", error: "Invalid Queue directive", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const { vaultOwnerId } = await getVaultAccessContext();
    const client = await getAuthedConvexClient();
    const input = parsed.data;
    const context = input.context?.map((ref) => {
      switch (ref.kind) {
        case "person": return { ...ref, refId: ref.refId as Id<"persons"> };
        case "relationship": return { ...ref, refId: ref.refId as Id<"relationships"> };
        case "place": return { ...ref, refId: ref.refId as Id<"places"> };
        case "event": return { ...ref, refId: ref.refId as Id<"events"> };
        case "source": return { ...ref, refId: ref.refId as Id<"sources"> };
        case "citation": return { ...ref, refId: ref.refId as Id<"citations"> };
        case "media": return { ...ref, refId: ref.refId as Id<"media"> };
        case "context_item": return { ...ref, refId: ref.refId as Id<"contextItems"> };
        case "research_task": return { ...ref, refId: ref.refId as Id<"researchTasks"> };
        case "research_check": return { ...ref, refId: ref.refId as Id<"researchChecks"> };
        case "story": return { ...ref, refId: ref.refId as Id<"stories"> };
        case "import_run": return { ...ref, refId: ref.refId as Id<"importRuns"> };
        case "provisional_relative": return { ...ref, refId: ref.refId as Id<"provisionalRelatives"> };
      }
    });
    const result = await client.mutation(api.queue.createQueueItem, {
      vaultOwnerId,
      ...input,
      context,
    });
    return NextResponse.json({ success: true, surfaceState: "ready", ...result }, { status: result.deduplicated ? 200 : 201 });
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);
    return NextResponse.json(
      { success: false, surfaceState: issue.statusCode === 403 ? "permission_denied" : "error", error: issue.title, details: issue.description },
      { status: issue.statusCode },
    );
  }
}
