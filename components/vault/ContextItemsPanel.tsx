"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type ContextItem = {
  _id: string;
  title: string;
  itemType: string;
  evidenceRole: string;
  content: string;
  sourceLabel?: string;
  privacyLevel: string;
  reviewStatus: string;
  aiUseAllowed: boolean;
};

export function ContextItemsPanel({
  personIdentifier,
  contextItems,
}: {
  personIdentifier: string;
  contextItems: ContextItem[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [sourceLabel, setSourceLabel] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [itemType, setItemType] = useState("research_snippet");
  const [evidenceRole, setEvidenceRole] = useState("lead_or_hint");
  const [privacyLevel, setPrivacyLevel] = useState("private");
  const [reviewStatus, setReviewStatus] = useState("unreviewed");
  const [aiUseAllowed, setAiUseAllowed] = useState(false);

  async function saveContextItem() {
    setSaving(true);
    try {
      const response = await fetch("/api/context-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personIdentifier,
          title,
          content,
          sourceLabel,
          sourceUrl,
          itemType,
          evidenceRole,
          privacyLevel,
          reviewStatus,
          aiUseAllowed,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(payload?.error || "Could not save context item");
        return;
      }
      setTitle("");
      setContent("");
      setSourceLabel("");
      setSourceUrl("");
      setPrivacyLevel("private");
      setReviewStatus("unreviewed");
      setAiUseAllowed(false);
      toast.success("Context item saved");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card className="border-stone-200">
        <CardHeader>
          <CardTitle>Loose Context Intake</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Context title" />
            <Input value={sourceLabel} onChange={(event) => setSourceLabel(event.target.value)} placeholder="Source label or archive note" />
            <Input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="Source URL, optional" className="md:col-span-2" />
          </div>

          <Textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Paste a note, clue, document reference, cemetery detail, building note, or research snippet."
            className="min-h-36"
          />

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <SelectField label="Type" value={itemType} options={["note", "document_ref", "research_snippet", "memory_note", "place_context", "building_context", "generated_summary", "other"]} onChange={setItemType} />
            <SelectField label="Role" value={evidenceRole} options={["raw_material", "researcher_conclusion", "generated_summary", "lead_or_hint", "background_context"]} onChange={setEvidenceRole} />
            <SelectField label="Privacy" value={privacyLevel} options={["private", "family_review", "publish_candidate", "public_source"]} onChange={setPrivacyLevel} />
            <SelectField label="Review" value={reviewStatus} options={["unreviewed", "reviewed", "disputed", "redacted", "rejected"]} onChange={setReviewStatus} />
            <label className="flex items-center gap-2 rounded-md border border-stone-200 px-3 py-2 text-sm text-stone-700">
              <input checked={aiUseAllowed} onChange={(event) => setAiUseAllowed(event.target.checked)} type="checkbox" />
              AI use
            </label>
          </div>

          <Button onClick={saveContextItem} disabled={saving || !title.trim() || !content.trim()} className="bg-amber-700 hover:bg-amber-800">
            <Save className="h-4 w-4" />
            Save context
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        {contextItems.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center text-sm text-stone-500">
              No loose context items yet.
            </CardContent>
          </Card>
        ) : (
          contextItems.map((item) => (
            <Card key={item._id} className="border-stone-200">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="text-base">{item.title}</CardTitle>
                  <Badge variant={item.reviewStatus === "reviewed" ? "default" : "secondary"}>
                    {item.reviewStatus.replace(/_/g, " ")}
                  </Badge>
                </div>
                <p className="text-sm text-stone-500">
                  {item.itemType.replace(/_/g, " ")} · {item.evidenceRole.replace(/_/g, " ")} · {item.privacyLevel.replace(/_/g, " ")}
                </p>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm leading-6 text-stone-600">{item.content}</p>
                {item.sourceLabel ? <p className="mt-3 text-xs text-stone-500">Source: {item.sourceLabel}</p> : null}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

function SelectField({
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
