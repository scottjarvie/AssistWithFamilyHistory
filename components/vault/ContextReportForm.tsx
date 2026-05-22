"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  LOCALITY_ERA_TEMPLATE_VERSION,
  localityEraBriefCategories,
  type ResearchPackCategory,
} from "@/lib/context/researchPacks";

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
  // Safe defaults: a context report is unreviewed and private until the
  // author explicitly promotes it. This matches the upsert mutation's own
  // defaults and prevents a stub Save from instantly becoming AI-eligible.
  const [privacyLevel, setPrivacyLevel] = useState("private");
  const [reviewStatus, setReviewStatus] = useState("unreviewed");
  const [aiUseAllowed, setAiUseAllowed] = useState(false);
  const [categorySummaries, setCategorySummaries] = useState<Record<ResearchPackCategory, string>>(
    Object.fromEntries(localityEraBriefCategories.map((entry) => [entry.category, ""])) as Record<ResearchPackCategory, string>
  );
  const [categorySynthesisNotes, setCategorySynthesisNotes] = useState<Record<ResearchPackCategory, string>>(
    Object.fromEntries(localityEraBriefCategories.map((entry) => [entry.category, ""])) as Record<ResearchPackCategory, string>
  );
  // One claim per line of free text. The form-level `sources` list applies
  // to every claim in the submission; per-claim source refs can be edited
  // later as the UI grows.
  const [categoryClaimLines, setCategoryClaimLines] = useState<Record<ResearchPackCategory, string>>(
    Object.fromEntries(localityEraBriefCategories.map((entry) => [entry.category, ""])) as Record<ResearchPackCategory, string>
  );
  const [categoryClaimConfidence, setCategoryClaimConfidence] = useState<Record<ResearchPackCategory, "high" | "medium" | "low">>(
    Object.fromEntries(localityEraBriefCategories.map((entry) => [entry.category, "medium"])) as Record<ResearchPackCategory, "high" | "medium" | "low">
  );
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const sharedSourceRefs = sources
        .split("\n")
        .map((source) => source.trim())
        .filter(Boolean);
      const categoryBlocks = localityEraBriefCategories
        .map((entry) => {
          const claimTexts = (categoryClaimLines[entry.category] || "")
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);
          return {
            category: entry.category,
            summary: categorySummaries[entry.category]?.trim() || "",
            sourcedClaims: claimTexts.map((text) => ({
              text,
              sourceRefs: sharedSourceRefs,
              confidence: categoryClaimConfidence[entry.category] || "medium",
            })),
            synthesisNotes: categorySynthesisNotes[entry.category]?.trim() || undefined,
          };
        })
        .filter((entry) => entry.summary || entry.synthesisNotes || entry.sourcedClaims.length > 0);
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
          packType: "locality_era_brief",
          templateVersion: LOCALITY_ERA_TEMPLATE_VERSION,
          privacyLevel,
          reviewStatus,
          aiUseAllowed,
          categoryBlocks,
        }),
      });
      const payload = await response.json();

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Unable to save context report");
      }

      toast.success("Context report saved");
      setContent("");
      setSources("");
      setCategorySummaries(
        Object.fromEntries(localityEraBriefCategories.map((entry) => [entry.category, ""])) as Record<ResearchPackCategory, string>
      );
      setCategorySynthesisNotes(
        Object.fromEntries(localityEraBriefCategories.map((entry) => [entry.category, ""])) as Record<ResearchPackCategory, string>
      );
      setCategoryClaimLines(
        Object.fromEntries(localityEraBriefCategories.map((entry) => [entry.category, ""])) as Record<ResearchPackCategory, string>
      );
      setCategoryClaimConfidence(
        Object.fromEntries(localityEraBriefCategories.map((entry) => [entry.category, "medium"])) as Record<ResearchPackCategory, "high" | "medium" | "low">
      );
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

      <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
        <div className="space-y-2">
          <Label htmlFor="context-privacy">Privacy</Label>
          <select
            id="context-privacy"
            value={privacyLevel}
            onChange={(event) => setPrivacyLevel(event.target.value)}
            className="h-9 w-full rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-700"
          >
            <option value="private">private</option>
            <option value="family_review">family review</option>
            <option value="publish_candidate">publish candidate</option>
            <option value="public_source">public source</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="context-review">Review</Label>
          <select
            id="context-review"
            value={reviewStatus}
            onChange={(event) => setReviewStatus(event.target.value)}
            className="h-9 w-full rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-700"
          >
            <option value="unreviewed">unreviewed</option>
            <option value="reviewed">reviewed</option>
            <option value="disputed">disputed</option>
            <option value="redacted">redacted</option>
            <option value="rejected">rejected</option>
          </select>
        </div>
        <label className="flex h-9 items-center gap-2 self-end rounded-md border border-stone-200 px-3 text-sm text-stone-700">
          <input
            type="checkbox"
            checked={aiUseAllowed}
            onChange={(event) => setAiUseAllowed(event.target.checked)}
            className="h-4 w-4 accent-amber-700"
          />
          AI use allowed
        </label>
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

      <div className="space-y-3 rounded-xl border border-stone-200 bg-stone-50 p-4">
        <div>
          <p className="text-sm font-medium text-stone-900">Locality Era Brief</p>
          <p className="mt-1 text-xs text-stone-500">{LOCALITY_ERA_TEMPLATE_VERSION}</p>
        </div>
        <div className="grid gap-3">
          {localityEraBriefCategories.map((entry) => (
            <div key={entry.category} className="grid gap-2 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`context-pack-${entry.category}`}>{entry.label}</Label>
                <Textarea
                  id={`context-pack-${entry.category}`}
                  value={categorySummaries[entry.category]}
                  onChange={(event) =>
                    setCategorySummaries((current) => ({
                      ...current,
                      [entry.category]: event.target.value,
                    }))
                  }
                  className="min-h-24 bg-white text-sm leading-6"
                  placeholder={entry.prompt}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`context-pack-${entry.category}-synthesis`}>Story-safe notes</Label>
                <Textarea
                  id={`context-pack-${entry.category}-synthesis`}
                  value={categorySynthesisNotes[entry.category]}
                  onChange={(event) =>
                    setCategorySynthesisNotes((current) => ({
                      ...current,
                      [entry.category]: event.target.value,
                    }))
                  }
                  className="min-h-24 bg-white text-sm leading-6"
                  placeholder="Optional synthesis wording or caution for Story Writer."
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-2">
                    <Label htmlFor={`context-pack-${entry.category}-claims`}>Sourced claims (one per line)</Label>
                    <Textarea
                      id={`context-pack-${entry.category}-claims`}
                      value={categoryClaimLines[entry.category]}
                      onChange={(event) =>
                        setCategoryClaimLines((current) => ({
                          ...current,
                          [entry.category]: event.target.value,
                        }))
                      }
                      className="min-h-20 bg-white text-sm leading-6"
                      placeholder="Each line becomes a claim backed by the sources below."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`context-pack-${entry.category}-confidence`}>Confidence</Label>
                    <select
                      id={`context-pack-${entry.category}-confidence`}
                      value={categoryClaimConfidence[entry.category]}
                      onChange={(event) =>
                        setCategoryClaimConfidence((current) => ({
                          ...current,
                          [entry.category]: event.target.value as "high" | "medium" | "low",
                        }))
                      }
                      className="h-9 rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-700"
                    >
                      <option value="high">high</option>
                      <option value="medium">medium</option>
                      <option value="low">low</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
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
