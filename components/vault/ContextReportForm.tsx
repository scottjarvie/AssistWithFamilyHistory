"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
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

// Per-claim editor row. sourceRefs is a list of source strings (a subset of
// the form-level sources) — stored as strings so they survive if the user
// edits or reorders the form-level sources list mid-session.
type ClaimRow = {
  text: string;
  sourceRefs: string[];
  confidence: "high" | "medium" | "low";
};

function emptyClaimsByCategory(): Record<ResearchPackCategory, ClaimRow[]> {
  return Object.fromEntries(
    localityEraBriefCategories.map((entry) => [entry.category, [] as ClaimRow[]])
  ) as Record<ResearchPackCategory, ClaimRow[]>;
}

function emptyStringsByCategory(): Record<ResearchPackCategory, string> {
  return Object.fromEntries(
    localityEraBriefCategories.map((entry) => [entry.category, ""])
  ) as Record<ResearchPackCategory, string>;
}

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
    emptyStringsByCategory()
  );
  const [categorySynthesisNotes, setCategorySynthesisNotes] = useState<Record<ResearchPackCategory, string>>(
    emptyStringsByCategory()
  );
  // Per-claim rows. Each claim carries its own subset of the form-level
  // sources so different claims in the same category can cite different
  // refs (the schema supports this; v1 collapsed all claims to the same
  // form-level list).
  const [categoryClaims, setCategoryClaims] = useState<Record<ResearchPackCategory, ClaimRow[]>>(
    emptyClaimsByCategory()
  );
  const [saving, setSaving] = useState(false);

  const parsedSources = useMemo(
    () =>
      sources
        .split("\n")
        .map((source) => source.trim())
        .filter(Boolean),
    [sources]
  );

  function addClaim(category: ResearchPackCategory) {
    setCategoryClaims((current) => ({
      ...current,
      // New claims default to inheriting all current form-level sources so
      // the fast path stays "type a claim, hit Save." The author can toggle
      // chips off to scope a claim to a subset.
      [category]: [...current[category], { text: "", sourceRefs: [...parsedSources], confidence: "medium" }],
    }));
  }

  function removeClaim(category: ResearchPackCategory, index: number) {
    setCategoryClaims((current) => ({
      ...current,
      [category]: current[category].filter((_, i) => i !== index),
    }));
  }

  function updateClaim(category: ResearchPackCategory, index: number, partial: Partial<ClaimRow>) {
    setCategoryClaims((current) => ({
      ...current,
      [category]: current[category].map((row, i) => (i === index ? { ...row, ...partial } : row)),
    }));
  }

  function toggleSourceRef(category: ResearchPackCategory, index: number, source: string) {
    setCategoryClaims((current) => ({
      ...current,
      [category]: current[category].map((row, i) => {
        if (i !== index) return row;
        const has = row.sourceRefs.includes(source);
        return {
          ...row,
          sourceRefs: has ? row.sourceRefs.filter((ref) => ref !== source) : [...row.sourceRefs, source],
        };
      }),
    }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const categoryBlocks = localityEraBriefCategories
        .map((entry) => {
          const claims = (categoryClaims[entry.category] || [])
            .map((row) => ({
              text: row.text.trim(),
              sourceRefs: row.sourceRefs.map((ref) => ref.trim()).filter(Boolean),
              confidence: row.confidence,
            }))
            .filter((row) => row.text.length > 0);
          return {
            category: entry.category,
            summary: categorySummaries[entry.category]?.trim() || "",
            sourcedClaims: claims,
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
      setCategorySummaries(emptyStringsByCategory());
      setCategorySynthesisNotes(emptyStringsByCategory());
      setCategoryClaims(emptyClaimsByCategory());
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
          {localityEraBriefCategories.map((entry) => {
            const claims = categoryClaims[entry.category];
            return (
              <div key={entry.category} className="space-y-3 border-t border-stone-200 pt-3 first:border-t-0 first:pt-0">
                <div className="grid gap-2 md:grid-cols-2">
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
                </div>
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Label>Sourced claims</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => addClaim(entry.category)}
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      Add claim
                    </Button>
                  </div>
                  {claims.length === 0 ? (
                    <p className="rounded-md border border-dashed border-stone-200 bg-white px-3 py-3 text-xs leading-5 text-stone-500">
                      No claims yet. Add a claim to record a specific assertion with its supporting source refs.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {claims.map((claim, index) => (
                        <div
                          key={index}
                          className="space-y-2 rounded-md border border-stone-200 bg-white p-3"
                        >
                          <div className="flex gap-2">
                            <Textarea
                              value={claim.text}
                              onChange={(event) => updateClaim(entry.category, index, { text: event.target.value })}
                              className="min-h-16 flex-1 text-sm leading-6"
                              placeholder="The town economy was shaped by quarrying through the 1880s."
                            />
                            <div className="flex flex-col gap-2">
                              <select
                                value={claim.confidence}
                                onChange={(event) =>
                                  updateClaim(entry.category, index, {
                                    confidence: event.target.value as "high" | "medium" | "low",
                                  })
                                }
                                className="h-9 rounded-md border border-stone-200 bg-white px-2 text-xs text-stone-700"
                                aria-label="Confidence"
                              >
                                <option value="high">high</option>
                                <option value="medium">medium</option>
                                <option value="low">low</option>
                              </select>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeClaim(entry.category, index)}
                                aria-label="Remove claim"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                          {parsedSources.length === 0 ? (
                            <p className="text-xs text-stone-500">
                              Add sources below to attach refs to this claim.
                            </p>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {parsedSources.map((source) => {
                                const selected = claim.sourceRefs.includes(source);
                                return (
                                  <button
                                    key={source}
                                    type="button"
                                    onClick={() => toggleSourceRef(entry.category, index, source)}
                                    className={
                                      "rounded-full border px-2 py-0.5 text-[11px] " +
                                      (selected
                                        ? "border-amber-300 bg-amber-50 text-amber-800"
                                        : "border-stone-200 bg-white text-stone-500 hover:bg-stone-50")
                                    }
                                  >
                                    {source.length > 36 ? source.slice(0, 33) + "…" : source}
                                  </button>
                                );
                              })}
                              {claim.sourceRefs
                                .filter((ref) => !parsedSources.includes(ref))
                                .map((orphan) => (
                                  <button
                                    key={`orphan-${orphan}`}
                                    type="button"
                                    onClick={() => toggleSourceRef(entry.category, index, orphan)}
                                    className="rounded-full border border-stone-200 bg-stone-100 px-2 py-0.5 text-[11px] text-stone-500 line-through"
                                    title="This source was removed from the form-level list. Click to drop it from this claim."
                                  >
                                    {orphan.length > 36 ? orphan.slice(0, 33) + "…" : orphan}
                                  </button>
                                ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
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
