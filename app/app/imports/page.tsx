"use client";

import { useEffect, useState } from "react";
import { SafeLink as Link } from "@/components/layout/SafeLink";
import { AlertTriangle, ArrowRight, CheckCircle2, ClipboardList, FileUp, FolderSync, Images, ScrollText } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  CaptureImportPreviewResponseSchema,
  classifyCaptureImportMergeResponse,
  getCaptureImportErrorMessage,
  type CaptureImportPreviewResponse,
} from "@/features/capture/importContract";
import {
  getAcceptedCaptureImportMergeRecovery,
  getCaptureImportReviewState,
  type CaptureImportTone,
} from "@/features/capture/importModel";

type RecentImport = {
  _id: string;
  personName: string;
  personFsId: string;
  personRouteId?: string;
  mergeStatus: string;
  pageTypes: string[];
  importedAt: number;
  warnings: string[];
  counts: {
    sources: number;
    memories: number;
    warnings: number;
  };
};

type BackendStatus = {
  tone: "ready" | "degraded";
  state: "ready" | "missing" | "stale" | "error";
  title: string;
  description: string;
};

export default function ImportsPage() {
  const [recentImports, setRecentImports] = useState<RecentImport[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importJson, setImportJson] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [backendStatus, setBackendStatus] = useState<BackendStatus | null>(null);
  const [lastImportWarnings, setLastImportWarnings] = useState<string[]>([]);
  const [previewResult, setPreviewResult] = useState<CaptureImportPreviewResponse | null>(null);
  const [previewPayload, setPreviewPayload] = useState<unknown | null>(null);

  async function loadRecentImports() {
    try {
      const response = await fetch("/api/convex/stats");
      const payload = await response.json();
      if (response.ok && payload?.success) {
        setRecentImports(payload.recentImports || []);
        setBackendStatus({
          tone: payload.backendState === "ready" ? "ready" : "degraded",
          state: payload.backendState || "ready",
          title: payload.backendTitle || "Vault backend connected",
          description:
            payload.backendDescription ||
            "Capture packages will merge into the canonical Convex research graph and appear in People, Places, and Research.",
        });
      } else {
        setRecentImports([]);
        setBackendStatus({
          tone: "degraded",
          state: payload?.backendState || "error",
          title: payload?.error || "Vault backend unavailable",
          description:
            payload?.details ||
            "Imports can still save local artifacts, but the canonical people, places, and import history views will not update until Convex is configured and current.",
        });
      }
    } catch {
      setRecentImports([]);
      setBackendStatus({
        tone: "degraded",
        state: "error",
        title: "Vault backend unavailable",
        description:
          "Imports can still save local artifacts, but the canonical people, places, and import history views will not update until Convex is configured and current.",
      });
    }
  }

  useEffect(() => {
    loadRecentImports();
  }, []);

  function parseImportJson() {
    if (!importJson.trim()) {
      toast.error("Paste a FamilySearch capture package first.");
      return null;
    }

    try {
      return JSON.parse(importJson);
    } catch {
      setImportError("Invalid JSON format");
      toast.error("Invalid JSON format");
      return null;
    }
  }

  async function handlePreview() {
    const parsed = parseImportJson();
    if (!parsed) return;

    setImporting(true);
    setImportError(null);
    setPreviewResult(null);
    setPreviewPayload(null);

    try {
      const response = await fetch("/api/import?preview=true", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(parsed),
      });
      const payload = await response.json();

      if (!response.ok) {
        const message = getCaptureImportErrorMessage(payload, "Import preview failed");
        setImportError(message);
        toast.error(message);
        return;
      }

      const parsedResponse = CaptureImportPreviewResponseSchema.safeParse(payload);
      if (!parsedResponse.success) {
        const message = "Import preview returned an unexpected response";
        setImportError(message);
        toast.error(message);
        return;
      }

      setPreviewResult(parsedResponse.data);
      setPreviewPayload(parsed);
      if (parsedResponse.data.canImport) {
        toast.success("Capture package is ready for review");
      } else {
        toast.warning("Capture package has blocking validation errors");
      }
    } catch {
      const message = "Import preview failed";
      setImportError(message);
      toast.error(message);
    } finally {
      setImporting(false);
    }
  }

  async function copyReviewReport() {
    if (!previewResult?.review) return;

    await navigator.clipboard.writeText(JSON.stringify(previewResult.review, null, 2));
    toast.success("Copied validation report");
  }

  async function handleImport() {
    if (!previewResult?.canImport || !previewPayload) {
      toast.error("Review the capture package before merging it into the vault.");
      return;
    }

    setImporting(true);
    setImportError(null);

    try {
      const response = await fetch("/api/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(previewPayload),
      });
      const outcome = await classifyCaptureImportMergeResponse(response);

      if (outcome.status === "rejected") {
        const message = getCaptureImportErrorMessage(outcome.payload, "Import failed");
        setImportError(message);
        toast.error(message);
        return;
      }

      if (outcome.status === "accepted_unverifiable") {
        const recovery = getAcceptedCaptureImportMergeRecovery();
        const message =
          "The server accepted the import, but its response could not be verified. Check Recent Imports before trying again.";
        setPreviewPayload(recovery.previewPayload);
        setPreviewResult(recovery.previewResult);
        if (recovery.refreshRecentImports) await loadRecentImports();
        setImportError(message);
        toast.warning(message);
        return;
      }

      const result = outcome.data;
      setLastImportWarnings(result.warnings);
      setBackendStatus({
        tone: result.backendState === "ready" ? "ready" : "degraded",
        state: result.backendState,
        title: result.backendTitle,
        description: result.backendDescription,
      });
      toast.success(`Imported ${result.sourceCount} sources and ${result.memoryCount} memories`);
      if (result.warnings.length > 0) {
        toast.warning(`Imported with ${result.warnings.length} warning${result.warnings.length === 1 ? "" : "s"}`);
      }
      setDialogOpen(false);
      setImportJson("");
      setPreviewPayload(null);
      setPreviewResult(null);
      loadRecentImports();
    } catch {
      const message = "Import failed";
      setImportError(message);
      toast.error(message);
    } finally {
      setImporting(false);
    }
  }

  const previewDiagnostics = previewResult ? getCaptureImportReviewState(previewResult) : null;

  return (
    <div className="p-4 sm:p-8">
      <section className="mb-8 rounded-[2rem] border border-stone-200 bg-white px-6 py-7 shadow-sm">
        <Badge variant="secondary" className="mb-4">FamilySearch-first intake</Badge>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-stone-900 sm:text-4xl">Imports</h1>
            <p className="mt-2 max-w-3xl text-stone-500">
              Bring FamilySearch source captures and memories into the vault. Raw capture artifacts stay on disk, while the structured person, place, source, and memory graph is merged into Convex.
            </p>
          </div>
          <Button onClick={() => setDialogOpen(true)} className="bg-amber-700 hover:bg-amber-800">
            <FileUp className="mr-2 h-4 w-4" />
            Import Capture Package
          </Button>
        </div>
      </section>

      {backendStatus ? (
        <section className="mb-8">
          <Card
            className={
              backendStatus.tone === "ready"
                ? "border-emerald-200 bg-emerald-50/70"
                : "border-amber-200 bg-amber-50/80"
            }
          >
            <CardHeader>
              <CardTitle className={backendStatus.tone === "ready" ? "text-emerald-900" : "text-amber-900"}>
                {backendStatus.title}
              </CardTitle>
              <CardDescription className={backendStatus.tone === "ready" ? "text-emerald-800" : "text-amber-900"}>
                {backendStatus.description}
              </CardDescription>
            </CardHeader>
          </Card>
        </section>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="border-stone-200 bg-white">
          <CardHeader>
            <CardTitle>What belongs in the vault</CardTitle>
            <CardDescription>Each import should deepen the same research graph, not create a new silo.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            {[
              {
                icon: ScrollText,
                title: "Evidence sources",
                text: "Source lists, expanded source details, citations, indexed facts, and record links.",
              },
              {
                icon: Images,
                title: "Memories",
                text: "Photos, scans, and uploaded memories linked back to people and places.",
              },
              {
                icon: FolderSync,
                title: "Merge history",
                text: "Every import run tracks warnings, merge status, page types, and artifact paths.",
              },
            ].map((item) => (
              <div key={item.title} className="rounded-2xl bg-stone-50 px-4 py-4">
                <item.icon className="mb-3 h-5 w-5 text-amber-700" />
                <p className="font-medium text-stone-900">{item.title}</p>
                <p className="mt-2 text-sm leading-6 text-stone-500">{item.text}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-stone-200 bg-white">
          <CardHeader>
            <CardTitle>Recent Imports</CardTitle>
            <CardDescription>The latest captures already merged into the research vault.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentImports.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-stone-200 px-4 py-10 text-center text-sm text-stone-500">
                No capture packages imported yet.
              </div>
            ) : (
              recentImports.map((run) => {
                const diagnostics = getRecentImportDiagnostics(run);
                const DiagnosticsIcon = diagnostics.tone === "ready" ? CheckCircle2 : AlertTriangle;

                return (
                  <div key={run._id} className="rounded-2xl border border-stone-200 px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Link
                          href={`/app/people/${run.personRouteId || run.personFsId}`}
                          className="font-medium text-stone-900 hover:text-amber-800"
                        >
                          {run.personName}
                        </Link>
                        <p className="text-sm text-stone-500">{run.pageTypes.join(" + ")}</p>
                      </div>
                      <Badge variant={run.mergeStatus === "partial" ? "destructive" : "secondary"}>
                        {run.mergeStatus}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-4 text-sm text-stone-500">
                      <span>{run.counts.sources} sources</span>
                      <span>{run.counts.memories} memories</span>
                      <span>{run.counts.warnings} warnings</span>
                      <span>{new Date(run.importedAt).toLocaleDateString()}</span>
                    </div>
                    <div className={`mt-3 rounded-2xl border px-3 py-3 text-sm ${diagnosticsClasses(diagnostics.tone)}`}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex gap-2">
                          <DiagnosticsIcon className="mt-0.5 h-4 w-4 shrink-0" />
                          <div>
                            <p className="font-medium">{diagnostics.title}</p>
                            <p className="mt-1 leading-6">{diagnostics.description}</p>
                          </div>
                        </div>
                        <Button asChild size="sm" variant="outline" className="shrink-0 bg-white/70">
                          <Link href={diagnostics.href}>{diagnostics.linkLabel}</Link>
                        </Button>
                      </div>
                    </div>
                    {run.warnings.length > 0 ? (
                      <div className="mt-3 space-y-2 rounded-2xl border border-amber-200 bg-amber-50/70 px-3 py-3 text-sm text-amber-950">
                        {run.warnings.slice(0, 2).map((warning) => (
                          <p key={warning}>{warning}</p>
                        ))}
                        {run.warnings.length > 2 ? (
                          <p className="text-amber-800">+ {run.warnings.length - 2} more warning(s)</p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </section>

      {lastImportWarnings.length > 0 ? (
        <section className="mt-8">
          <Card className="border-amber-200 bg-amber-50/80">
            <CardHeader>
              <CardTitle className="text-amber-900">Latest Import Warnings</CardTitle>
              <CardDescription className="text-amber-900">
                These items were imported, but they still need a researcher review.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="mb-3 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-white/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-3">
                  <ClipboardList className="mt-0.5 h-5 w-5 shrink-0 text-amber-800" />
                  <div>
                    <p className="font-medium text-amber-950">Next action: review the generated work queue</p>
                    <p className="mt-1 text-sm text-amber-900">
                      Import warnings create review work. Check operations before using this import for story drafting.
                    </p>
                  </div>
                </div>
                <Button asChild size="sm" variant="outline" className="bg-white/80">
                  <Link href="/app/operations?sortBy=newestImport">Open Operations</Link>
                </Button>
              </div>
              {lastImportWarnings.map((warning) => (
                <div
                  key={warning}
                  className="rounded-xl border border-amber-200 bg-white/70 px-4 py-3 text-sm text-amber-950"
                >
                  {warning}
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      ) : null}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[min(88vh,760px)] max-w-3xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0">
          <DialogHeader>
            <div className="px-6 pt-6">
              <DialogTitle>Import FamilySearch Capture</DialogTitle>
              <DialogDescription className="mt-2 pr-8">
              Paste either a v2 capture package or a legacy source capture artifact. The importer will save raw artifacts and merge structured data into the vault.
              </DialogDescription>
            </div>
          </DialogHeader>
          <div className="min-h-0 space-y-4 overflow-y-auto px-6 pb-4">
            <Textarea
              value={importJson}
              onChange={(event) => {
                setImportJson(event.target.value);
                setImportError(null);
                setPreviewResult(null);
                setPreviewPayload(null);
              }}
              placeholder='{"schemaVersion":"2.0", ...}'
              className="max-h-[42vh] min-h-[220px] resize-y overflow-y-auto font-mono text-sm"
            />
            {importError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {importError}
              </div>
            ) : null}
            {previewResult && previewDiagnostics ? (
              <div className={`rounded-xl border px-4 py-3 text-sm ${diagnosticsClasses(previewDiagnostics.tone)}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {previewResult.personName || "Unknown person"} · {previewResult.personId || "No FamilySearch ID"}
                    </p>
                    <p className="mt-1">
                      {previewResult.pageType} capture · {previewResult.sourceCount} sources ·{" "}
                      {previewResult.memoryCount} memories
                    </p>
                  </div>
                  <Badge variant={previewDiagnostics.tone === "blocked" ? "destructive" : "secondary"}>
                    {previewDiagnostics.title}
                  </Badge>
                </div>
                <div className="mt-3 flex gap-2">
                  {previewDiagnostics.tone === "ready" ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  )}
                  <p>{previewDiagnostics.description}</p>
                </div>
                {previewResult.review?.summary ? (
                  <p className="mt-3 font-medium">{previewResult.review.summary}</p>
                ) : null}
                {previewResult.validation.errors.length > 0 ? (
                  <div className="mt-3 space-y-1">
                    <p className="font-medium">Blocking errors</p>
                    {previewResult.validation.errors.map((error) => (
                      <p key={error}>{error}</p>
                    ))}
                  </div>
                ) : null}
                {previewResult.validation.warnings.length > 0 ? (
                  <div className="mt-3 space-y-1">
                    <p className="font-medium">Review warnings</p>
                    {previewResult.validation.warnings.map((warning) => (
                      <p key={warning}>{warning}</p>
                    ))}
                  </div>
                ) : null}
                {previewResult.review ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={copyReviewReport}
                    className="mt-3 bg-white/70"
                  >
                    Copy Validation Report
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-3 border-t bg-white px-6 py-4">
            <Button onClick={handlePreview} disabled={importing} className="bg-amber-700 hover:bg-amber-800">
              {importing ? "Checking..." : "Review Package"}
            </Button>
            <Button
              onClick={handleImport}
              disabled={importing || !previewDiagnostics?.canMerge}
              variant="outline"
            >
              {importing ? "Merging..." : "Merge into Vault"}
            </Button>
            <Button asChild variant="outline">
              <Link href="/app/people">
                Go to People Explorer
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function getRecentImportDiagnostics(run: RecentImport) {
  const warningCount = run.counts.warnings || run.warnings.length;
  if (run.mergeStatus === "partial" || warningCount > 0) {
    return {
      tone: "warning" as CaptureImportTone,
      title: "Review needed",
      description:
        "Warnings were preserved for research review. Check the person workspace and operations queue before treating this import as clean.",
      href: `/app/operations?q=${encodeURIComponent(run.personName || run.personFsId)}`,
      linkLabel: "Review in Operations",
    };
  }

  return {
    tone: "ready" as CaptureImportTone,
    title: "Merged cleanly",
    description: "No warnings were reported for this import. Continue from the person workspace.",
    href: `/app/people/${run.personRouteId || run.personFsId}`,
    linkLabel: "Open Workspace",
  };
}

function diagnosticsClasses(tone: CaptureImportTone) {
  if (tone === "ready") return "border-emerald-200 bg-emerald-50 text-emerald-950";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-950";
  return "border-red-200 bg-red-50 text-red-800";
}
