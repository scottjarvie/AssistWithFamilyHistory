import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getAuthedConvexClient, getConvexRuntimeIssue, isConvexConfigured } from "@/lib/convex/server";
import { getVaultAccessContext } from "@/lib/vault/server";

const CommandSchema = z.discriminatedUnion("command", [
  z.object({ command: z.literal("assign"), chosenAiId: z.string().min(1).max(160), expectedVersion: z.number().int().positive(), idempotencyKey: z.string().min(1).max(160) }),
  z.object({ command: z.literal("claim"), leaseMs: z.number().int(), nextStep: z.string().min(1).max(1_000), expectedVersion: z.number().int().positive(), idempotencyKey: z.string().min(1).max(160) }),
  z.object({ command: z.literal("checkpoint"), leaseMs: z.number().int(), nextStep: z.string().min(1).max(1_000), expectedVersion: z.number().int().positive(), idempotencyKey: z.string().min(1).max(160) }),
  z.object({ command: z.literal("resume"), answerSummary: z.string().min(1).max(1_000), expectedVersion: z.number().int().positive(), idempotencyKey: z.string().min(1).max(160) }),
  z.object({ command: z.literal("complete"), resultSummary: z.string().min(1).max(4_000), resultRefs: z.array(z.string().min(1).max(500)).max(20).optional(), expectedVersion: z.number().int().positive(), idempotencyKey: z.string().min(1).max(160) }),
  z.object({ command: z.literal("cancel"), reason: z.string().min(1).max(1_000), expectedVersion: z.number().int().positive(), idempotencyKey: z.string().min(1).max(160) }),
  z.object({ command: z.literal("reopen"), reason: z.string().min(1).max(1_000), expectedVersion: z.number().int().positive(), idempotencyKey: z.string().min(1).max(160) }),
]);

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  if (!isConvexConfigured()) {
    const issue = getConvexRuntimeIssue();
    return NextResponse.json({ success: false, surfaceState: "error", error: issue.title, details: issue.description }, { status: issue.statusCode });
  }
  try {
    const { id } = await context.params;
    const { vaultOwnerId } = await getVaultAccessContext();
    const client = await getAuthedConvexClient();
    const result = await client.action(api.queue.getQueueItem, {
      vaultOwnerId,
      queueItemId: id as Id<"queueItems">,
      activityPagination: {
        numItems: Math.max(1, Math.min(Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "50", 10) || 50, 100)),
        cursor: request.nextUrl.searchParams.get("cursor"),
      },
    });
    if (!result) return NextResponse.json({ success: false, surfaceState: "error", error: "Queue item not found" }, { status: 404 });
    return NextResponse.json({ success: true, surfaceState: "ready", ...result });
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);
    return NextResponse.json({ success: false, surfaceState: issue.statusCode === 403 ? "permission_denied" : "error", error: issue.title, details: issue.description }, { status: issue.statusCode });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!isConvexConfigured()) {
    const issue = getConvexRuntimeIssue();
    return NextResponse.json({ success: false, surfaceState: "error", error: issue.title, details: issue.description }, { status: issue.statusCode });
  }
  try {
    const parsed = CommandSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ success: false, surfaceState: "error", error: "Invalid Queue command", issues: parsed.error.issues }, { status: 400 });
    }
    const { id } = await context.params;
    const queueItemId = id as Id<"queueItems">;
    const { vaultOwnerId } = await getVaultAccessContext();
    const client = await getAuthedConvexClient();
    const command = parsed.data;
    let result;
    switch (command.command) {
      case "assign":
        result = await client.mutation(api.queue.assignQueueItemToAi, { vaultOwnerId, queueItemId, chosenAiId: command.chosenAiId, expectedVersion: command.expectedVersion, idempotencyKey: command.idempotencyKey });
        break;
      case "claim":
        result = await client.mutation(api.queue.claimQueueItemAsUser, { vaultOwnerId, queueItemId, leaseMs: command.leaseMs, nextStep: command.nextStep, expectedVersion: command.expectedVersion, idempotencyKey: command.idempotencyKey });
        break;
      case "checkpoint":
        result = await client.mutation(api.queue.checkpointQueueItemAsUser, { vaultOwnerId, queueItemId, leaseMs: command.leaseMs, nextStep: command.nextStep, expectedVersion: command.expectedVersion, idempotencyKey: command.idempotencyKey });
        break;
      case "resume":
        result = await client.mutation(api.queue.resumeQueueItem, { vaultOwnerId, queueItemId, answerSummary: command.answerSummary, expectedVersion: command.expectedVersion, idempotencyKey: command.idempotencyKey });
        break;
      case "complete":
        result = await client.mutation(api.queue.completeQueueItemAsUser, { vaultOwnerId, queueItemId, resultSummary: command.resultSummary, resultRefs: command.resultRefs, expectedVersion: command.expectedVersion, idempotencyKey: command.idempotencyKey });
        break;
      case "cancel":
        result = await client.mutation(api.queue.cancelQueueItem, { vaultOwnerId, queueItemId, reason: command.reason, expectedVersion: command.expectedVersion, idempotencyKey: command.idempotencyKey });
        break;
      case "reopen":
        result = await client.mutation(api.queue.reopenQueueItem, { vaultOwnerId, queueItemId, reason: command.reason, expectedVersion: command.expectedVersion, idempotencyKey: command.idempotencyKey });
        break;
    }
    return NextResponse.json({ success: true, surfaceState: "ready", ...result });
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);
    const status = error instanceof Error && error.name === "QueueConflictError" ? 409 : issue.statusCode;
    return NextResponse.json({ success: false, surfaceState: status === 403 ? "permission_denied" : status === 409 ? "retry" : "error", error: issue.title, details: issue.description }, { status });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  if (!isConvexConfigured()) {
    const issue = getConvexRuntimeIssue();
    return NextResponse.json({ success: false, surfaceState: "error", error: issue.title, details: issue.description }, { status: issue.statusCode });
  }
  try {
    const body = z.object({ confirmation: z.literal("delete_queue_item_and_history") }).parse(await request.json());
    const { id } = await context.params;
    const { vaultOwnerId } = await getVaultAccessContext();
    const client = await getAuthedConvexClient();
    const result = await client.action(api.queue.deleteQueueItem, {
      vaultOwnerId,
      queueItemId: id as Id<"queueItems">,
      confirmation: body.confirmation,
    });
    return NextResponse.json({ success: true, surfaceState: "empty", ...result });
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);
    return NextResponse.json({ success: false, surfaceState: issue.statusCode === 403 ? "permission_denied" : "error", error: issue.title, details: issue.description }, { status: issue.statusCode });
  }
}
