"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type MediaItem = {
  _id: string;
  title: string;
  type: string;
  url?: string;
  description?: string;
  familySearchUrl?: string;
  privacyLevel?: "private" | "family_review" | "publish_candidate" | "public_source";
  reviewStatus?: "unreviewed" | "reviewed" | "redacted" | "rejected";
  rightsStatus?: "unknown" | "owned" | "permitted" | "public_domain" | "restricted";
  aiUseAllowed?: boolean;
  privacyReviewNote?: string;
};

export function MediaPrivacyReviewPanel({ media }: { media: MediaItem[] }) {
  const router = useRouter();
  const [savingId, setSavingId] = useState<string | null>(null);
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

  if (media.length === 0) return null;

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {media.map((item) => {
        const draft = drafts[item._id];
        const publicEligible =
          draft.reviewStatus === "reviewed" &&
          (draft.privacyLevel === "publish_candidate" || draft.privacyLevel === "public_source") &&
          draft.rightsStatus !== "unknown" &&
          draft.rightsStatus !== "restricted";

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
              {item.url ? (
                <div className="overflow-hidden rounded-md border border-stone-200 bg-stone-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.url} alt={item.title} className="h-44 w-full object-cover" />
                </div>
              ) : null}
              {item.description ? <p className="text-sm text-stone-600">{item.description}</p> : null}

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
