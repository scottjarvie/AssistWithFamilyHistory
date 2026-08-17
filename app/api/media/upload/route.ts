/**
 * Put a real file into the vault.
 *
 * Family history research runs on scanned records and photographs. Before this
 * route existed, a media row could only ever be a *reference* — usually a
 * FamilySearch memory URL that answers the person's own signed-in browser and
 * nothing else — so a chosen AI asked to read the census page got its title and
 * an honest refusal instead of the page. Bytes uploaded here land in private
 * Convex file storage, which owner-checked server code can read and no link can
 * reach, so `family_history_get_evidence` can hand a model the actual scan
 * without ever handing out a storage URL.
 *
 * Uploading is deliberately not the same act as allowing AI use: every file
 * arrives `unreviewed`, `private`, and `aiUseAllowed: false`, and the person
 * decides the rest in the media review panel.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getAuthedConvexClient, getConvexRuntimeIssue, isConvexConfigured } from "@/lib/convex/server";
import { getVaultAccessContext } from "@/lib/vault/server";
import {
  MEDIA_UPLOAD_MAX_BYTES,
  classifyMediaUpload,
  isAcceptedMediaUploadType,
} from "@/lib/media/uploadContract";

const MetadataSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2_000).optional(),
  mediaId: z.string().trim().min(1).optional(),
  personIds: z.array(z.string().trim().min(1)).max(25).optional(),
});

export async function POST(request: NextRequest) {
  if (!isConvexConfigured()) {
    const issue = getConvexRuntimeIssue();
    return NextResponse.json({ error: issue.title, details: issue.description }, { status: issue.statusCode });
  }

  try {
    const { vaultOwnerId } = await getVaultAccessContext();

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!form || !(file instanceof File)) {
      return NextResponse.json({ error: "Attach a file to upload." }, { status: 400 });
    }

    const rawPersonIds = form.getAll("personIds").filter((value): value is string => typeof value === "string");
    const parsed = MetadataSchema.safeParse({
      title: (form.get("title") as string | null)?.trim() || file.name,
      description: (form.get("description") as string | null) || undefined,
      mediaId: (form.get("mediaId") as string | null) || undefined,
      personIds: rawPersonIds.length > 0 ? rawPersonIds : undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Missing or invalid upload details", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const mimeType = (file.type || "application/octet-stream").toLowerCase();
    if (!isAcceptedMediaUploadType(mimeType)) {
      return NextResponse.json(
        { error: "That file type cannot be stored here. Upload an image, PDF, plain text, or an audio or video recording." },
        { status: 415 },
      );
    }
    if (file.size <= 0) {
      return NextResponse.json({ error: "That file is empty." }, { status: 400 });
    }
    if (file.size > MEDIA_UPLOAD_MAX_BYTES) {
      return NextResponse.json(
        { error: `That file is larger than ${Math.round(MEDIA_UPLOAD_MAX_BYTES / (1024 * 1024))} MB. Upload a smaller scan or a cropped page.` },
        { status: 413 },
      );
    }

    const client = await getAuthedConvexClient();

    // Bytes go straight from this server to Convex storage. They never pass
    // through a function argument, so a large scan is not bounded by the
    // argument-size limit and never lands in a log.
    const { uploadUrl } = await client.mutation(api.vaultMutations.startMediaUpload, { vaultOwnerId });
    const stored = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": mimeType },
      body: await file.arrayBuffer(),
    });
    if (!stored.ok) {
      return NextResponse.json({ error: "The file could not be stored. Try again." }, { status: 502 });
    }
    const { storageId } = (await stored.json()) as { storageId: string };

    const result = await client.mutation(api.vaultMutations.attachMediaFile, {
      vaultOwnerId,
      mediaId: parsed.data.mediaId ? (parsed.data.mediaId as Id<"media">) : undefined,
      storageId: storageId as Id<"_storage">,
      title: parsed.data.title,
      type: classifyMediaUpload(mimeType),
      mimeType,
      sizeBytes: file.size,
      description: parsed.data.description,
      personIds: parsed.data.personIds?.map((id) => id as Id<"persons">),
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);
    return NextResponse.json({ error: issue.title, details: issue.description }, { status: issue.statusCode });
  }
}
