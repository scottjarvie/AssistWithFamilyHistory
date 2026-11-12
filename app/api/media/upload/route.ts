import { checkFileSize } from "@/convex/lib/usageLimits/core";
import {audioDurationDefaults} from "@/lib/media/siteDefaults";
import { normalizeAudioMime, validateAudioContainer, audioContainerError, checkVoiceNoteDuration, voiceNoteTooLongError } from "@/convex/lib/media/audio";
import { usageRefusalOf } from "@/convex/usageLimits";
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
  let cleanup:(()=>Promise<unknown>)|undefined;
  const attemptId=crypto.randomUUID();
  const operationId=request.headers.get("idempotency-key") ?? crypto.randomUUID();
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

    const mimeType = (!file.type.startsWith("video/") && normalizeAudioMime(file.type)) || (file.type || "application/octet-stream").toLowerCase();
    if (!isAcceptedMediaUploadType(mimeType)) {
      return NextResponse.json(
        { error: "That file type cannot be stored here. Upload an image, PDF, plain text, or an audio or video recording." },
        { status: 415 },
      );
    }
    if (file.size <= 0) {
      return NextResponse.json({ error: "That file is empty." }, { status: 400 });
    }
    const audioKind = form.get("audioKind") === "voicenote" ? "voicenote" as const : "audio" as const;
    const client = await getAuthedConvexClient();

    // Bytes go straight from this server to Convex storage. They never pass
    // through a function argument, so a large scan is not bounded by the
    // argument-size limit and never lands in a log.
    const started = await client.mutation(api.vaultMutations.startMediaUpload, { vaultOwnerId, sizeBytes:file.size, operationId, attemptId });
    if(started.created)cleanup=()=>client.mutation(api.vaultMutations.cancelMediaUpload,{vaultOwnerId,operationId,attemptId});
    if(started.busy)return NextResponse.json({error:"This upload is in progress. Retry with the same operation ID."},{status:409});
    if(started.mediaId) return NextResponse.json({success:true,mediaId:started.mediaId,created:false,storage:started.storage});
    if (!mimeType.startsWith("video/") && normalizeAudioMime(mimeType)) {
      const sizeRefusal=started.audioCaps ? checkFileSize(audioKind,file.size,started.audioCaps[audioKind]) : null;
      if(sizeRefusal) {
        if(cleanup) await cleanup();
        return NextResponse.json({...sizeRefusal,error:sizeRefusal.message},{status:413});
      }
      const durationCap=started.maxVoiceNoteSeconds ?? audioDurationDefaults.voicenote;
      const result = await validateAudioContainer({size:file.size, read:async(offset,length)=>new Uint8Array(await file.slice(offset,offset+length).arrayBuffer())}, mimeType);
      if(result.valid && audioKind === "voicenote" && result.durationSeconds !== null && checkVoiceNoteDuration(result.durationSeconds,durationCap)) {
        if(cleanup) await cleanup();
        const refusal=voiceNoteTooLongError(result.durationSeconds,durationCap);
        return NextResponse.json({...refusal,error:refusal.message},{status:400});
      }
      if (!result.valid) {
        if(cleanup) await cleanup();
        const refusal=audioContainerError(result.reason);
        return NextResponse.json({...refusal,error:refusal.message},{status:415});
      }
    }
    let storageId:string|undefined=started.storageId;
    if(!storageId) {
      const stored = await fetch(started.uploadUrl, {
        method: "POST", headers: { "Content-Type": mimeType }, body: await file.arrayBuffer(),
      });
      if (!stored.ok) {
        if(cleanup)await cleanup();
        return NextResponse.json({ error: "The file could not be stored. Try again." }, { status: 502 });
      }
      storageId=((await stored.json()) as {storageId:string}).storageId;
      await client.mutation(api.vaultMutations.stageMediaUpload,{vaultOwnerId,operationId,attemptId,storageId:storageId as Id<"_storage">});
    }

    const result = await client.mutation(api.vaultMutations.attachMediaFile, {
      vaultOwnerId,
      operationId,
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
    if(cleanup) { try { if(cleanup)await cleanup(); } catch { /* Retain the reservation for confirmed cleanup on expiry. */ } }
    const fileRefusal=(error as {data?:{code?:string;message?:string}})?.data;
    if(fileRefusal?.code==="FILE_TOO_LARGE") return NextResponse.json({error:fileRefusal.message,...fileRefusal},{status:413});
    const refusal=usageRefusalOf(error);
    if(refusal) return NextResponse.json({error:refusal.message,...refusal},{status:413});
    const issue = getConvexRuntimeIssue(error);
    return NextResponse.json({ error: issue.title, details: issue.description }, { status: issue.statusCode });
  }
}
