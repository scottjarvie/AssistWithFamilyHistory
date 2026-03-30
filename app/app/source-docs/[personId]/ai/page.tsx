"use client";

import { useEffect, useState, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { toast } from "sonner";
import {
  ArrowLeft,
  Brain,
  Shield,
  Upload,
  Download,
  Play,
  Check,
  AlertTriangle,
  Loader2,
  Copy,
} from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ClusterSchema,
  EvidencePack,
  NormalizedSourceSchema,
  Synthesis,
  SynthesisSchema,
} from "@/features/source-docs/lib/schemas";
import { redactEvidencePack, getRedactionSummary } from "@/features/source-docs/lib/redactor";
import { ExportPromptDialog } from "@/features/source-docs/components/ExportPromptDialog";
import { ImportResultsDialog } from "@/features/source-docs/components/ImportResultsDialog";
import { buildExportPrompt, SYSTEM_PROMPTS } from "@/lib/ai/promptBuilder";
import { generateContextualizedDocument } from "@/features/source-docs/lib/contextualizedDocGenerator";

interface PageProps {
  params: Promise<{ personId: string }>;
}

type Stage = "normalize" | "cluster" | "synthesize";

interface StageStatus {
  status: "pending" | "processing" | "complete" | "error";
  data?: unknown;
  error?: string;
}

function parseAiJson(raw: string): unknown {
  const trimmed = raw.trim();

  const direct = tryParseJson(trimmed);
  if (direct.success) return direct.data;

  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeBlockMatch?.[1]) {
    const fromCodeBlock = tryParseJson(codeBlockMatch[1].trim());
    if (fromCodeBlock.success) return fromCodeBlock.data;
  }

  const firstArray = trimmed.indexOf("[");
  const lastArray = trimmed.lastIndexOf("]");
  if (firstArray !== -1 && lastArray > firstArray) {
    const fromArray = tryParseJson(trimmed.slice(firstArray, lastArray + 1));
    if (fromArray.success) return fromArray.data;
  }

  const firstObject = trimmed.indexOf("{");
  const lastObject = trimmed.lastIndexOf("}");
  if (firstObject !== -1 && lastObject > firstObject) {
    const fromObject = tryParseJson(trimmed.slice(firstObject, lastObject + 1));
    if (fromObject.success) return fromObject.data;
  }

  throw new Error("AI response is not valid JSON");
}

function tryParseJson(input: string): { success: true; data: unknown } | { success: false } {
  try {
    return { success: true, data: JSON.parse(input) };
  } catch {
    return { success: false };
  }
}

function validateStageResult(stage: Stage, data: unknown): unknown {
  switch (stage) {
    case "normalize":
      return z.array(NormalizedSourceSchema).parse(data);
    case "cluster":
      return ClusterSchema.parse(data);
    case "synthesize":
      return SynthesisSchema.parse(data);
  }
}

export default function AIProcessingPage({ params }: PageProps) {
  const { personId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const runId = searchParams.get("run");

  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  const [evidencePack, setEvidencePack] = useState<EvidencePack | null>(null);
  const [redactedPack, setRedactedPack] = useState<EvidencePack | null>(null);
  const [redactionSummary, setRedactionSummary] = useState<string>("");
  const [hasLivingIndicators, setHasLivingIndicators] = useState(false);
  const [personName, setPersonName] = useState<string>("");
  const [useRedacted, setUseRedacted] = useState(true);

  const [contextualizedMarkdown, setContextualizedMarkdown] = useState<string>("");
  const [copiedContextualized, setCopiedContextualized] = useState(false);

  const [stages, setStages] = useState<Record<Stage, StageStatus>>({
    normalize: { status: "pending" },
    cluster: { status: "pending" },
    synthesize: { status: "pending" },
  });

  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [currentStage, setCurrentStage] = useState<Stage>("normalize");

  useEffect(() => {
    async function fetchData() {
      try {
        setPageError(null);

        const personResponse = await fetch(`/api/people/${personId}`);
        const personData = await personResponse.json();

        if (!personResponse.ok || !personData.success) {
          router.push("/app/people");
          return;
        }

        setPersonName(personData.person.name || personId);
        const targetRunId = runId || personData.latestRunId;

        if (!targetRunId) {
          setPageError("No extraction runs found for this person. Import a capture package first.");
          return;
        }

        setActiveRunId(targetRunId);

        const packResponse = await fetch(`/api/people/${personId}/runs/${targetRunId}/pack`);
        const packData = await packResponse.json();

        if (!packResponse.ok || !packData.success) {
          setPageError(packData.error || "Could not load the legacy source capture for this run.");
          return;
        }

        const pack = packData.pack as EvidencePack;
        setEvidencePack(pack);

        const { redactedPack: redacted, redactions, hasLivingIndicators: hasLiving } =
          redactEvidencePack(pack);

        setRedactedPack(redacted);
        setRedactionSummary(getRedactionSummary(redactions));
        setHasLivingIndicators(hasLiving);

        const contextualizedResponse = await fetch(
          `/api/people/${personId}/contextualized?run=${targetRunId}`
        );
        const contextualizedData = await contextualizedResponse.json().catch(() => null);

        if (contextualizedResponse.ok && contextualizedData?.success) {
          setContextualizedMarkdown(contextualizedData.markdown || "");
          setStages((prev) => ({
            ...prev,
            synthesize: {
              ...prev.synthesize,
              status: "complete",
            },
          }));
        }
      } catch (error) {
        setPageError(error instanceof Error ? error.message : "Failed to load AI processing data");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [personId, runId, router]);

  const pack = useRedacted ? redactedPack : evidencePack;

  const handleExport = (stage: Stage) => {
    setCurrentStage(stage);
    setExportDialogOpen(true);
  };

  const handleImport = (stage: Stage) => {
    setCurrentStage(stage);
    setImportDialogOpen(true);
  };

  const saveContextualized = async (markdown: string) => {
    if (!activeRunId) return;

    const response = await fetch(`/api/people/${personId}/contextualized`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId: activeRunId, markdown }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || "Failed to save contextualized dossier");
    }
  };

  const handleImportComplete = async (data: unknown) => {
    try {
      const validated = validateStageResult(currentStage, data);

      setStages((prev) => ({
        ...prev,
        [currentStage]: { status: "complete", data: validated },
      }));

      if (currentStage === "synthesize" && activeRunId && evidencePack) {
        const synthesis = validated as Synthesis;
        const markdown = generateContextualizedDocument({
          personName: evidencePack.person.name || personName,
          personId,
          runId: activeRunId,
          synthesis,
        });

        setContextualizedMarkdown(markdown);
        await saveContextualized(markdown);
      }
    } catch (error) {
      const message = error instanceof z.ZodError
        ? error.issues.map((issue) => issue.message).join(", ")
        : error instanceof Error
        ? error.message
        : "Imported data is invalid";

      setStages((prev) => ({
        ...prev,
        [currentStage]: { status: "error", error: message },
      }));
      toast.error(message);
    }
  };

  const runStage = async (stage: Stage) => {
    if (!pack) {
      toast.error("Evidence pack is not loaded yet");
      return;
    }

    const settingsRaw = localStorage.getItem("telltheirstories-settings");
    const settings = settingsRaw ? JSON.parse(settingsRaw) : {};

    if (!settings.openRouterApiKey) {
      toast.error("Please set your OpenRouter API key in Settings");
      return;
    }

    let stageInput: unknown;
    if (stage === "normalize") {
      stageInput = pack.sources;
    } else if (stage === "cluster") {
      if (stages.normalize.status !== "complete" || !stages.normalize.data) {
        toast.error("Run or import Stage 1 results first");
        return;
      }
      stageInput = stages.normalize.data;
    } else {
      if (
        stages.normalize.status !== "complete" ||
        !stages.normalize.data ||
        stages.cluster.status !== "complete" ||
        !stages.cluster.data
      ) {
        toast.error("Run or import Stage 1 and Stage 2 results first");
        return;
      }

      stageInput = {
        person: pack.person,
        normalizedSources: stages.normalize.data,
        clusters: stages.cluster.data,
      };
    }

    setStages((prev) => ({
      ...prev,
      [stage]: { status: "processing" },
    }));

    try {
      toast.info(`Processing ${stage} stage...`);

      const response = await fetch("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: buildExportPrompt(stage, stageInput),
          model: settings.selectedModel,
          apiKey: settings.openRouterApiKey,
          systemPrompt: SYSTEM_PROMPTS[stage],
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "AI processing request failed");
      }

      const parsedJson = parseAiJson(payload.content || "");
      const validated = validateStageResult(stage, parsedJson);

      setStages((prev) => ({
        ...prev,
        [stage]: { status: "complete", data: validated },
      }));

      if (stage === "synthesize" && activeRunId && evidencePack) {
        const synthesis = validated as Synthesis;
        const markdown = generateContextualizedDocument({
          personName: evidencePack.person.name || personName,
          personId,
          runId: activeRunId,
          synthesis,
        });

        setContextualizedMarkdown(markdown);
        await saveContextualized(markdown);
      }

      toast.success(`${stage} stage complete`);
    } catch (error) {
      const message = error instanceof z.ZodError
        ? error.issues.map((issue) => issue.message).join(", ")
        : error instanceof Error
        ? error.message
        : "Processing failed";

      setStages((prev) => ({
        ...prev,
        [stage]: { status: "error", error: message },
      }));
      toast.error(message);
    }
  };

  const handleDownloadContextualized = () => {
    if (!contextualizedMarkdown) return;

    const fileName = `${(personName || personId).replace(/\s+/g, "-")}-contextualized.md`;
    const blob = new Blob([contextualizedMarkdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyContextualized = async () => {
    await navigator.clipboard.writeText(contextualizedMarkdown);
    setCopiedContextualized(true);
    setTimeout(() => setCopiedContextualized(false), 2000);
    toast.success("Copied contextualized dossier");
  };

  if (loading) {
    return <div className="p-8 text-center text-stone-400">Loading...</div>;
  }

  if (pageError || !pack) {
    return (
      <div className="p-4 sm:p-8">
        <Card className="border-orange-300 bg-orange-50">
          <CardHeader>
            <CardTitle className="text-orange-900">Cannot Start AI Analysis</CardTitle>
            <CardDescription className="text-orange-800">
              {pageError || "Evidence pack data is missing for this run."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="bg-amber-700 hover:bg-amber-800">
              <Link href={`/app/people/${personId}`}>Back to Person Workspace</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8">
      <Link
        href={`/app/people/${personId}`}
        className="mb-6 inline-flex items-center gap-1 text-stone-500 hover:text-stone-900"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to {personName}
      </Link>

      <div className="mb-8 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-stone-900">
            <Brain className="w-6 h-6 text-amber-700" />
            AI Analysis
          </h1>
          <p className="mt-1 text-stone-500">
            Run staged AI processing on run <span className="font-mono">{activeRunId}</span>
          </p>
        </div>
        <Badge variant="secondary">{pack.sources.length} sources</Badge>
      </div>

      {hasLivingIndicators && (
        <Card className="mb-6 border-orange-300 bg-orange-50">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 w-5 h-5 text-orange-600" />
              <div>
                <h3 className="font-medium text-orange-900">Living Person Indicators Detected</h3>
                <p className="mt-1 text-sm text-orange-700">
                  This data may contain living-person details. Redaction is recommended before AI processing.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-amber-700" />
              <CardTitle className="text-lg">Privacy Controls</CardTitle>
            </div>
            <Badge variant={useRedacted ? "default" : "secondary"}>
              {useRedacted ? "Redacted" : "Original"}
            </Badge>
          </div>
          <CardDescription>{redactionSummary}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant={useRedacted ? "default" : "outline"}
              onClick={() => setUseRedacted(true)}
              className={useRedacted ? "bg-amber-700 hover:bg-amber-800" : ""}
            >
              <Shield className="w-4 h-4 mr-2" />
              Use Redacted Data
            </Button>
            <Button variant={!useRedacted ? "default" : "outline"} onClick={() => setUseRedacted(false)}>
              Use Original Data
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="normalize" className="space-y-6">
        <TabsList className="h-auto flex-wrap gap-2">
          <TabsTrigger value="normalize" className="flex items-center gap-2">
            Stage 1: Normalize
            {stages.normalize.status === "complete" && <Check className="w-4 h-4 text-green-600" />}
          </TabsTrigger>
          <TabsTrigger value="cluster" className="flex items-center gap-2">
            Stage 2: Cluster
            {stages.cluster.status === "complete" && <Check className="w-4 h-4 text-green-600" />}
          </TabsTrigger>
          <TabsTrigger value="synthesize" className="flex items-center gap-2">
            Stage 3: Synthesize
            {stages.synthesize.status === "complete" && <Check className="w-4 h-4 text-green-600" />}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="normalize">
          <Card>
            <CardHeader>
              <CardTitle>Stage 1: Normalize Sources</CardTitle>
              <CardDescription>Extract normalized people, places, claims, and dates from each source.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={() => runStage("normalize")}
                  disabled={stages.normalize.status === "processing"}
                  className="bg-amber-700 hover:bg-amber-800"
                >
                  {stages.normalize.status === "processing" ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4 mr-2" />
                  )}
                  Run with OpenRouter
                </Button>
                <Button variant="outline" onClick={() => handleExport("normalize")}>
                  <Download className="w-4 h-4 mr-2" />
                  Export Prompt
                </Button>
                <Button variant="outline" onClick={() => handleImport("normalize")}>
                  <Upload className="w-4 h-4 mr-2" />
                  Import Results
                </Button>
              </div>

              {stages.normalize.status === "error" && (
                <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {stages.normalize.error}
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cluster">
          <Card>
            <CardHeader>
              <CardTitle>Stage 2: Cluster & Deduplicate</CardTitle>
              <CardDescription>Group related sources and identify overlaps.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {stages.normalize.status !== "complete" ? (
                <p className="text-stone-500">Complete Stage 1 first.</p>
              ) : (
                <div className="flex flex-wrap gap-3">
                  <Button
                    onClick={() => runStage("cluster")}
                    disabled={stages.cluster.status === "processing"}
                    className="bg-amber-700 hover:bg-amber-800"
                  >
                    {stages.cluster.status === "processing" ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4 mr-2" />
                    )}
                    Run with OpenRouter
                  </Button>
                  <Button variant="outline" onClick={() => handleExport("cluster")}>
                    <Download className="w-4 h-4 mr-2" />
                    Export Prompt
                  </Button>
                  <Button variant="outline" onClick={() => handleImport("cluster")}>
                    <Upload className="w-4 h-4 mr-2" />
                    Import Results
                  </Button>
                </div>
              )}

              {stages.cluster.status === "error" && (
                <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {stages.cluster.error}
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="synthesize">
          <Card>
            <CardHeader>
              <CardTitle>Stage 3: Synthesize Dossier</CardTitle>
              <CardDescription>Produce a contextualized dossier with timeline, conflicts, and next steps.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {stages.cluster.status !== "complete" ? (
                <p className="text-stone-500">Complete Stage 2 first.</p>
              ) : (
                <div className="flex flex-wrap gap-3">
                  <Button
                    onClick={() => runStage("synthesize")}
                    disabled={stages.synthesize.status === "processing"}
                    className="bg-amber-700 hover:bg-amber-800"
                  >
                    {stages.synthesize.status === "processing" ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4 mr-2" />
                    )}
                    Run with OpenRouter
                  </Button>
                  <Button variant="outline" onClick={() => handleExport("synthesize")}>
                    <Download className="w-4 h-4 mr-2" />
                    Export Prompt
                  </Button>
                  <Button variant="outline" onClick={() => handleImport("synthesize")}>
                    <Upload className="w-4 h-4 mr-2" />
                    Import Results
                  </Button>
                </div>
              )}

              {stages.synthesize.status === "complete" && contextualizedMarkdown && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                  <div className="flex items-center gap-2 text-green-700">
                    <Check className="w-5 h-5" />
                    <span className="font-medium">Contextualized dossier generated</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button asChild size="sm" className="bg-green-700 hover:bg-green-800">
                      <Link href={`/app/people/${personId}/contextualized?run=${activeRunId}`}>
                        View Dossier
                      </Link>
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleCopyContextualized}>
                      <Copy className="w-4 h-4 mr-2" />
                      {copiedContextualized ? "Copied" : "Copy Markdown"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleDownloadContextualized}>
                      <Download className="w-4 h-4 mr-2" />
                      Download .md
                    </Button>
                  </div>
                </div>
              )}

              {stages.synthesize.status === "error" && (
                <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {stages.synthesize.error}
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ExportPromptDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        evidencePack={pack}
        stage={currentStage}
        stageData={stages[currentStage].data}
      />

      <ImportResultsDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        stage={currentStage}
        onImport={handleImportComplete}
      />
    </div>
  );
}
