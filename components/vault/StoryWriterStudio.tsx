"use client";

import { useEffect, useState } from "react";
import { SafeLink as Link } from "@/components/layout/SafeLink";
import { AlertTriangle, ArrowRight, Copy, Loader2, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { STORY_WRITER_MODES, STORY_WRITER_SYSTEM_PROMPT, buildStoryWriterPrompt, getStoryTitle, type StoryWriterMode } from "@/lib/ai/storyWriter";
import { getAiPrivacyDisclosure } from "@/lib/ai/privacy";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type ContextPackResponse = {
  success: boolean;
  structured: {
    person: {
      displayName: string;
      fsId?: string;
      living?: boolean;
    };
    stats: {
      sources: number;
      memories: number;
      places: number;
      imports: number;
    };
    historicalContext?: Array<{
      _id: string;
      title: string;
      packType?: string;
      templateVersion?: string;
      privacyLevel?: string;
      reviewStatus?: string;
      aiUseAllowed?: boolean;
    }>;
    storyClaimReadiness?: {
      unresolvedProvisionalRelatives?: number;
      unresolvedImportWarnings?: string[];
      mediaNeedingPrivacyReview?: Array<{
        title: string;
        privacyLevel: string;
        reviewStatus: string;
        rightsStatus: string;
        aiUseAllowed: boolean;
      }>;
    };
  };
  markdown: string;
};

type LocalSettings = {
  openRouterApiKey?: string;
  selectedModel?: string;
};

const SETTINGS_KEY = "telltheirstories-settings";
const MODE_ORDER: StoryWriterMode[] = ["short_story", "narrative_draft", "research_gap_notes"];

export function StoryWriterStudio({ personId }: { personId: string }) {
  const [contextPack, setContextPack] = useState<ContextPackResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<StoryWriterMode>("short_story");
  const [draft, setDraft] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastModelUsed, setLastModelUsed] = useState<string>("manual");
  const [savedStoryId, setSavedStoryId] = useState<string | null>(null);

  useEffect(() => {
    async function loadContextPack() {
      try {
        setError(null);
        const response = await fetch(`/api/people/${personId}/context-pack`);
        const payload = await response.json();

        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error || "Failed to load context pack");
        }

        setContextPack(payload);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load context pack");
      } finally {
        setLoading(false);
      }
    }

    loadContextPack();
  }, [personId]);

  function getSettings(): LocalSettings {
    if (typeof window === "undefined") return {};

    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return {};

    try {
      return JSON.parse(raw) as LocalSettings;
    } catch {
      return {};
    }
  }

  async function handleCopyPrompt() {
    if (!contextPack) return;

    const prompt = buildStoryWriterPrompt(mode, contextPack.structured.person.displayName);
    const fullPrompt = `${STORY_WRITER_SYSTEM_PROMPT}\n\n${prompt}\n\nCONTEXT PACK:\n${contextPack.markdown}`;

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API unavailable");
      }
      await navigator.clipboard.writeText(fullPrompt);
      toast.success("Story Writer prompt copied");
    } catch {
      toast.error("Clipboard unavailable. Select and copy the generated prompt manually from a supported browser.");
    }
  }

  async function handleGenerate() {
    if (!contextPack) return;

    const settings = getSettings();
    if (!settings.openRouterApiKey) {
      toast.error("Add an OpenRouter API key in Settings or use Copy Prompt for manual generation.");
      return;
    }
    if (contextPack.structured.person.living) {
      toast.error("Story Writer will not send living-person context to OpenRouter.");
      return;
    }
    if ((contextPack.structured.storyClaimReadiness?.mediaNeedingPrivacyReview?.length ?? 0) > 0) {
      toast.error("Review media privacy and AI-use permissions before sending this context to OpenRouter.");
      return;
    }

    setGenerating(true);
    try {
      const prompt = buildStoryWriterPrompt(mode, contextPack.structured.person.displayName);
      const response = await fetch("/api/process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          data: contextPack.markdown,
          apiKey: settings.openRouterApiKey,
          model: settings.selectedModel,
          systemPrompt: STORY_WRITER_SYSTEM_PROMPT,
          privacyAcknowledged: true,
          redactionMode: "original_reviewed",
        }),
      });
      const payload = await response.json();

      if (!response.ok || !payload?.content) {
        throw new Error(payload?.error || "Failed to generate story draft");
      }

      setDraft(payload.content);
      setSavedStoryId(null);
      setLastModelUsed(settings.selectedModel || "manual");
      toast.success(`Generated ${STORY_WRITER_MODES[mode].outputLabel}`);
    } catch (generationError) {
      toast.error(generationError instanceof Error ? generationError.message : "Story generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    if (!contextPack || !draft.trim()) {
      toast.error("Generate or paste a draft before saving.");
      return;
    }

    setSaving(true);
    try {
      const promptUsed = buildStoryWriterPrompt(mode, contextPack.structured.person.displayName);
      const response = await fetch(`/api/people/${personId}/stories`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode,
          title: getStoryTitle(contextPack.structured.person.displayName, mode),
          content: draft,
          promptUsed,
          modelUsed: lastModelUsed,
          generatedBy: lastModelUsed === "manual" ? "human" : "ai",
          contextPackIds: contextPack.structured.historicalContext?.map((entry) => entry._id) ?? [],
        }),
      });
      const payload = await response.json();

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Failed to save story draft");
      }

      setSavedStoryId(payload.storyId);
      toast.success("Story draft saved to Story Studio");
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "Failed to save story draft");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-amber-700" />
      </div>
    );
  }

  if (error || !contextPack) {
    return (
      <Card className="border-dashed border-stone-300">
        <CardHeader>
          <CardTitle>Story Writer unavailable</CardTitle>
          <CardDescription>{error || "Could not load the person context pack."}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const personName = contextPack.structured.person.displayName;
  const researchPackCount = contextPack.structured.historicalContext?.length ?? 0;
  const researchPackLabels =
    contextPack.structured.historicalContext
      ?.map((entry) => entry.title)
      .slice(0, 3)
      .join("; ") || "None";
  const privacyWarnings = [
    contextPack.structured.person.living ? "This person is marked living. Use manual review; in-app AI generation is blocked." : null,
    (contextPack.structured.storyClaimReadiness?.unresolvedProvisionalRelatives ?? 0) > 0
      ? "Unresolved provisional relatives are present. Keep relationship claims tentative."
      : null,
    (contextPack.structured.storyClaimReadiness?.unresolvedImportWarnings?.length ?? 0) > 0
      ? "Import warnings are present. Review them before treating the context pack as clean."
      : null,
    (contextPack.structured.storyClaimReadiness?.mediaNeedingPrivacyReview?.length ?? 0) > 0
      ? "Media or memory items still need privacy, rights, or AI-use review. In-app AI generation is blocked."
      : null,
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-stone-200 bg-white px-6 py-6 shadow-sm">
        <Badge variant="secondary" className="mb-4">Context-pack driven</Badge>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-stone-900 sm:text-4xl">Story Writer</h1>
            <p className="mt-2 max-w-3xl text-stone-500">
              Turn {personName}&apos;s context pack into a short story, a longer narrative draft, or research-gap notes without leaving the vault.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Sources", contextPack.structured.stats.sources],
              ["Memories", contextPack.structured.stats.memories],
              ["Places", contextPack.structured.stats.places],
              ["Packs", researchPackCount],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-stone-50 px-4 py-4 text-center">
                <p className="text-xs uppercase tracking-[0.2em] text-stone-400">{label}</p>
                <p className="mt-2 text-2xl font-semibold text-stone-900">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Card className="border-amber-200 bg-amber-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-950">
            <AlertTriangle className="h-5 w-5" />
            AI Privacy Review
          </CardTitle>
          <CardDescription className="text-amber-900">
            {getAiPrivacyDisclosure("original_reviewed")}
          </CardDescription>
        </CardHeader>
        {privacyWarnings.length > 0 ? (
          <CardContent className="space-y-2 text-sm text-amber-950">
            {privacyWarnings.map((warning) => (
              <p key={warning} className="rounded-xl border border-amber-200 bg-white/60 px-3 py-2">
                {warning}
              </p>
            ))}
          </CardContent>
        ) : null}
      </Card>

      <Card className="border-stone-200">
        <CardHeader>
          <CardTitle>Research Packs</CardTitle>
          <CardDescription>
            {researchPackCount > 0
              ? researchPackLabels
              : "No reviewed AI-allowed locality or historical context packs are available for this person."}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm leading-6 text-stone-600">
          Research packs provide background setting only. Person-specific claims still need source-backed facts or citations before publication.
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="border-stone-200">
          <CardHeader>
            <CardTitle>Choose Output</CardTitle>
            <CardDescription>Each mode uses the same context pack but aims at a different deliverable.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {MODE_ORDER.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setMode(option)}
                className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                  mode === option
                    ? "border-amber-300 bg-amber-50"
                    : "border-stone-200 bg-white hover:border-amber-200"
                }`}
              >
                <p className="font-medium text-stone-900">{STORY_WRITER_MODES[option].title}</p>
                <p className="mt-2 text-sm leading-6 text-stone-500">{STORY_WRITER_MODES[option].description}</p>
              </button>
            ))}

            <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 px-4 py-4 text-sm leading-6 text-stone-600">
              If you don&apos;t want to use in-app generation, copy the prompt, run it in your preferred AI tool, then paste the result here and save it back into the vault.
            </div>
          </CardContent>
        </Card>

        <Card className="border-stone-200">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-3">
              <Sparkles className="h-5 w-5 text-amber-700" />
              <CardTitle>{STORY_WRITER_MODES[mode].title}</CardTitle>
            </div>
            <CardDescription>
              The current draft stays editable, so you can refine an AI output or paste a manual result before saving.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <Button onClick={handleGenerate} disabled={generating} className="bg-amber-700 hover:bg-amber-800">
                {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Generate In App
              </Button>
              <Button onClick={handleCopyPrompt} variant="outline">
                <Copy className="mr-2 h-4 w-4" />
                Copy Prompt
              </Button>
              <Button onClick={handleSave} variant="outline" disabled={saving || !draft.trim()}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Draft
              </Button>
              {savedStoryId ? (
                <Button asChild className="bg-stone-900 hover:bg-stone-800">
                  <Link href={`/app/stories/${savedStoryId}`}>
                    Review Saved Story
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              ) : null}
              <Button asChild variant="ghost">
                <Link href={`/app/people/${personId}`}>Back to Person Workspace</Link>
              </Button>
            </div>

            <Textarea
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setSavedStoryId(null);
              }}
              className="min-h-[460px] text-sm leading-6"
              placeholder="Generate a draft in-app or paste a manual result here."
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
