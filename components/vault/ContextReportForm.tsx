"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const CONTEXT_TOPICS = [
  "daily_life",
  "economy",
  "religion",
  "politics",
  "migration",
  "health",
  "technology",
  "culture",
  "war",
  "disaster",
  "other",
];

export function ContextReportForm({
  placeId,
  placeName,
  startYear,
  endYear,
}: {
  placeId?: string;
  placeName?: string;
  startYear?: number;
  endYear?: number;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(placeName ? `${placeName} context report` : "");
  const [topic, setTopic] = useState("daily_life");
  const [fromYear, setFromYear] = useState(String(startYear || 1850));
  const [toYear, setToYear] = useState(String(endYear || 1950));
  const [content, setContent] = useState("");
  const [sources, setSources] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const response = await fetch("/api/context-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placeId,
          title,
          topic,
          startYear: fromYear,
          endYear: toYear,
          content,
          sources,
        }),
      });
      const payload = await response.json();

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Unable to save context report");
      }

      toast.success("Context report saved");
      setContent("");
      setSources("");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save context report");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-[1fr_180px]">
        <div className="space-y-2">
          <Label htmlFor="context-title">Report title</Label>
          <Input id="context-title" value={title} onChange={(event) => setTitle(event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="context-topic">Topic</Label>
          <select
            id="context-topic"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            className="h-9 w-full rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-700"
          >
            {CONTEXT_TOPICS.map((option) => (
              <option key={option} value={option}>
                {option.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="context-start">Start year</Label>
          <Input id="context-start" inputMode="numeric" value={fromYear} onChange={(event) => setFromYear(event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="context-end">End year</Label>
          <Input id="context-end" inputMode="numeric" value={toYear} onChange={(event) => setToYear(event.target.value)} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="context-content">Research report</Label>
        <Textarea
          id="context-content"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          className="min-h-52 text-sm leading-6"
          placeholder="Paste or write the researched context about this place, era, church, building, economy, migration pattern, or local history."
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="context-sources">Sources, one per line</Label>
        <Textarea
          id="context-sources"
          value={sources}
          onChange={(event) => setSources(event.target.value)}
          className="min-h-24 text-sm leading-6"
          placeholder="URLs, books, archive references, reports, or notes used for this context."
        />
      </div>

      <Button onClick={handleSave} disabled={saving || !title.trim() || !content.trim()} className="bg-amber-700 hover:bg-amber-800">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save context report
      </Button>
    </div>
  );
}
