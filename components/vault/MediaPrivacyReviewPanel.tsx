"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ShieldCheck, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  MEDIA_UPLOAD_ACCEPT_ATTRIBUTE,
  MEDIA_UPLOAD_MAX_BYTES,
} from "@/lib/media/uploadContract";

type MediaItem = {
  _id: string;
  title: string;
  type: string;
  url?: string;
  storageId?: string;
  b2Original?: { sha256: string };
  b2Renditions?: { medium: { contentType: string } };
  sizeBytes?: number;
  description?: string;
  familySearchUrl?: string;
  privacyLevel?: "private" | "family_review" | "publish_candidate" | "public_source";
  reviewStatus?: "unreviewed" | "reviewed" | "redacted" | "rejected";
  rightsStatus?: "unknown" | "owned" | "permitted" | "public_domain" | "restricted";
  aiUseAllowed?: boolean;
  privacyReviewNote?: string;
  metadataProposal?: {
    temporal: {
      cameraCaptureTime?: string;
      scanTime?: string;
      fileModifiedTime?: string;
      uploadTime: string;
      inferredHistoricalEventDate?: string;
    };
    location?: {
      latitude: number;
      longitude: number;
      association: "person_media" | "event" | "place";
      disclosurePrecision: "withheld" | "locality" | "region";
    };
    decision: "pending" | "accepted" | "declined";
  };
};

/**
 * Upload one file into the vault, optionally onto an existing media row.
 *
 * Returns the server's message on failure so the caller can show the person the
 * real reason rather than a generic one.
 */
async function uploadMediaFile(args: {
  file: File;
  personId?: string;
  mediaId?: string;
  title?: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (args.file.size > MEDIA_UPLOAD_MAX_BYTES) {
    return {
      ok: false,
      message: `That file is larger than ${Math.round(MEDIA_UPLOAD_MAX_BYTES / (1024 * 1024))} MB.`,
    };
  }
  const body = new FormData();
  body.append("file", args.file);
  body.append("title", args.title?.trim() || args.file.name);
  if (args.personId) body.append("personIds", args.personId);
  if (args.mediaId) body.append("mediaId", args.mediaId);

  const response = await fetch("/api/media/upload", { method: "POST", body });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    return { ok: false, message: payload?.error || "The file could not be uploaded." };
  }
  return { ok: true };
}

export function MediaPrivacyReviewPanel({
  media,
  personId,
}: {
  media: MediaItem[];
  personId?: string;
}) {
  const router = useRouter();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState(() =>
    Object.fromEntries(
      media.map((item) => [
        item._id,
        {
          privacyLevel: item.privacyLevel ?? "private",
          reviewStatus: item.reviewStatus ?? "unreviewed",
          rightsStatus: item.rightsStatus ?? "unknown",
          aiUseAllowed: item.aiUseAllowed === true,
          privacyReviewNote: item.privacyReviewNote ?? "",
          metadataDecision: item.metadataProposal?.decision ?? "pending",
        },
      ])
    )
  );

  function updateDraft(mediaId: string, patch: Partial<(typeof drafts)[string]>) {
    setDrafts((current) => ({
      ...current,
      [mediaId]: {
        ...current[mediaId],
        ...patch,
      },
    }));
  }

  async function saveReview(item: MediaItem) {
    const draft = drafts[item._id];
    setSavingId(item._id);
    try {
      const response = await fetch("/api/media/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaId: item._id,
          ...draft,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(payload?.error || "Could not save media review");
        return;
      }
      toast.success("Media review saved");
      router.refresh();
    } finally {
      setSavingId(null);
    }
  }

  async function attachFile(item: MediaItem, file: File) {
    setUploadingId(item._id);
    try {
      const result = await uploadMediaFile({
        file,
        personId,
        mediaId: item._id,
        title: item.title,
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("File stored. Review it to let an AI read it.");
      router.refresh();
    } finally {
      setUploadingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <MediaUploadCard personId={personId} onUploaded={() => router.refresh()} />

      {media.length === 0 ? null : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {media.map((item) => {
            const draft = drafts[item._id];
            const publicEligible =
              draft.reviewStatus === "reviewed" &&
              (draft.privacyLevel === "publish_candidate" || draft.privacyLevel === "public_source") &&
              draft.rightsStatus !== "unknown" &&
              draft.rightsStatus !== "restricted";
            // A stored file is bytes this vault holds. Everything else is a
            // reference that only this browser can follow — worth saying out
            // loud, because it is exactly the difference between an AI being
            // able to read the record and only being able to cite its title.
            const held = Boolean(item.storageId || item.b2Renditions?.medium);
            const previewSrc = held
              ? `/api/media/${item._id}/file`
              : item.url;
            const isImage = held ? true : Boolean(item.url);

            return (
              <Card key={item._id} className="border-stone-200">
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-lg">{item.title}</CardTitle>
                      <p className="mt-1 text-sm text-stone-500">{item.type}</p>
                    </div>
                    <Badge variant={publicEligible ? "default" : "secondary"}>
                      {publicEligible ? "story eligible" : "review gated"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {previewSrc && isImage ? (
                    <div className="overflow-hidden rounded-md border border-stone-200 bg-stone-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={previewSrc} alt={item.title} className="h-44 w-full object-cover" />
                    </div>
                  ) : null}

                  <div className="rounded-md border border-stone-200 bg-stone-50 p-3 text-sm text-stone-600">
                    {held ? (
                      <p>
                        <span className="font-medium text-stone-800">This file is stored here.</span>{" "}
                        Once you mark it reviewed with usable rights and allow AI use, a connected
                        AI can read the record itself, not just its title.
                      </p>
                    ) : (
                      <p>
                        <span className="font-medium text-stone-800">Only a reference is stored.</span>{" "}
                        This item points at a file elsewhere, so a connected AI cannot read it. Upload
                        the file to let one see the record.
                      </p>
                    )}
                    <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100">
                      <Upload className="h-4 w-4" />
                      {uploadingId === item._id
                        ? "Uploading…"
                        : held
                          ? "Replace file"
                          : "Upload the file"}
                      <input
                        type="file"
                        className="sr-only"
                        accept={MEDIA_UPLOAD_ACCEPT_ATTRIBUTE}
                        disabled={uploadingId === item._id}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = "";
                          if (file) void attachFile(item, file);
                        }}
                      />
                    </label>
                  </div>

                  {item.description ? <p className="text-sm text-stone-600">{item.description}</p> : null}

                  {item.metadataProposal ? (
                    <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-stone-700">
                      <p className="font-medium text-stone-900">Proposed metadata evidence</p>
                      {item.metadataProposal.temporal.cameraCaptureTime ? (
                        <p>Camera capture time: {item.metadataProposal.temporal.cameraCaptureTime}</p>
                      ) : null}
                      {item.metadataProposal.temporal.scanTime ? <p>Scan time: {item.metadataProposal.temporal.scanTime}</p> : null}
                      {item.metadataProposal.temporal.fileModifiedTime ? <p>File-modified time: {item.metadataProposal.temporal.fileModifiedTime}</p> : null}
                      <p>Vault upload time: {item.metadataProposal.temporal.uploadTime}</p>
                      {item.metadataProposal.temporal.inferredHistoricalEventDate ? (
                        <p>Inferred historical event date: {item.metadataProposal.temporal.inferredHistoricalEventDate}</p>
                      ) : null}
                      {item.metadataProposal.location ? (
                        <p>
                          Embedded GPS: {item.metadataProposal.location.latitude.toFixed(5)}, {item.metadataProposal.location.longitude.toFixed(5)}.
                          Default association: this person&apos;s media. Disclosure remains withheld.
                        </p>
                      ) : null}
                      <FieldSelect
                        label="Metadata proposal"
                        value={draft.metadataDecision}
                        options={["pending", "accepted", "declined"]}
                        onChange={(value) => updateDraft(item._id, { metadataDecision: value as typeof draft.metadataDecision })}
                      />
                      <p className="text-xs text-stone-600">
                        Accepting this proposal does not publish a coordinate or turn a camera/scan time into a historical event date.
                      </p>
                    </div>
                  ) : null}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <FieldSelect
                      label="Privacy"
                      value={draft.privacyLevel}
                      options={["private", "family_review", "publish_candidate", "public_source"]}
                      onChange={(value) => updateDraft(item._id, { privacyLevel: value as typeof draft.privacyLevel })}
                    />
                    <FieldSelect
                      label="Review"
                      value={draft.reviewStatus}
                      options={["unreviewed", "reviewed", "redacted", "rejected"]}
                      onChange={(value) => updateDraft(item._id, { reviewStatus: value as typeof draft.reviewStatus })}
                    />
                    <FieldSelect
                      label="Rights"
                      value={draft.rightsStatus}
                      options={["unknown", "owned", "permitted", "public_domain", "restricted"]}
                      onChange={(value) => updateDraft(item._id, { rightsStatus: value as typeof draft.rightsStatus })}
                    />
                    <label className="flex items-center gap-2 rounded-md border border-stone-200 px-3 py-2 text-sm text-stone-700">
                      <input
                        type="checkbox"
                        checked={draft.aiUseAllowed}
                        onChange={(event) => updateDraft(item._id, { aiUseAllowed: event.target.checked })}
                      />
                      AI use allowed
                    </label>
                  </div>

                  <Textarea
                    value={draft.privacyReviewNote}
                    onChange={(event) => updateDraft(item._id, { privacyReviewNote: event.target.value })}
                    placeholder="Review note, rights source, consent detail, or publication restriction"
                    className="min-h-24"
                  />

                  <Button onClick={() => void saveReview(item)} disabled={savingId === item._id} className="w-full bg-stone-900 hover:bg-stone-800">
                    <ShieldCheck className="h-4 w-4" />
                    Save Review
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Add a file the vault does not have yet — a scan, a photograph, a record PDF,
 * a recorded interview. This is the front door for evidence that never came
 * from an import.
 */
function MediaUploadCard({
  personId,
  onUploaded,
}: {
  personId?: string;
  onUploaded: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList) {
    setUploading(true);
    try {
      let stored = 0;
      for (const file of Array.from(files)) {
        const result = await uploadMediaFile({ file, personId });
        if (result.ok) stored += 1;
        else toast.error(`${file.name}: ${result.message}`);
      }
      if (stored > 0) {
        toast.success(
          stored === 1
            ? "File stored. Review it to let an AI read it."
            : `${stored} files stored. Review them to let an AI read them.`,
        );
        onUploaded();
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card className="border-dashed border-stone-300 bg-stone-50">
      <CardContent className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-stone-800">Add a scan, photo, or recording</p>
          <p className="mt-1 text-sm text-stone-600">
            Files you upload are stored privately here. Nothing is shared with an AI until you
            review the item and allow AI use.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="shrink-0"
        >
          <Upload className="h-4 w-4" />
          {uploading ? "Uploading…" : "Upload files"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="sr-only"
          accept={MEDIA_UPLOAD_ACCEPT_ATTRIBUTE}
          onChange={(event) => {
            const files = event.target.files;
            event.target.value = "";
            if (files && files.length > 0) void handleFiles(files);
          }}
        />
      </CardContent>
    </Card>
  );
}

function FieldSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1 text-xs font-medium uppercase tracking-[0.12em] text-stone-500">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-md border border-stone-200 bg-white px-3 text-sm font-normal normal-case tracking-normal text-stone-700"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option.replace(/_/g, " ")}
          </option>
        ))}
      </select>
    </label>
  );
}
