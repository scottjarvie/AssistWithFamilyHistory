"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, FileUp, FolderSync, Images, ScrollText } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

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

  async function handleImport() {
    if (!importJson.trim()) {
      toast.error("Paste a FamilySearch capture package first.");
      return;
    }

    setImporting(true);
    setImportError(null);

    try {
      const parsed = JSON.parse(importJson);
      const response = await fetch("/api/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(parsed),
      });
      const payload = await response.json();

      if (!response.ok || !payload?.success) {
        const message = payload?.error || "Import failed";
        setImportError(message);
        toast.error(message);
        return;
      }

      setLastImportWarnings(Array.isArray(payload.warnings) ? payload.warnings : []);
      if (payload.backendTitle && payload.backendDescription) {
        setBackendStatus({
          tone: payload.backendState === "ready" ? "ready" : "degraded",
          state: payload.backendState || "ready",
          title: payload.backendTitle,
          description: payload.backendDescription,
        });
      }
      toast.success(`Imported ${payload.sourceCount || 0} sources and ${payload.memoryCount || 0} memories`);
      if (Array.isArray(payload.warnings) && payload.warnings.length > 0) {
        toast.warning(`Imported with ${payload.warnings.length} warning${payload.warnings.length === 1 ? "" : "s"}`);
      }
      setDialogOpen(false);
      setImportJson("");
      loadRecentImports();
    } catch (error) {
      const message = error instanceof SyntaxError ? "Invalid JSON format" : "Import failed";
      setImportError(message);
      toast.error(message);
    } finally {
      setImporting(false);
    }
  }

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
              recentImports.map((run) => (
                <Link
                  key={run._id}
                  href={`/app/people/${run.personRouteId || run.personFsId}`}
                  className="block rounded-2xl border border-stone-200 px-4 py-4 transition hover:border-amber-300 hover:bg-amber-50/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-stone-900">{run.personName}</p>
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
                </Link>
              ))
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
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Import FamilySearch Capture</DialogTitle>
            <DialogDescription>
              Paste either a v2 capture package or a legacy source capture artifact. The importer will save raw artifacts and merge structured data into the vault.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              value={importJson}
              onChange={(event) => {
                setImportJson(event.target.value);
                setImportError(null);
              }}
              placeholder='{"schemaVersion":"2.0", ...}'
              className="min-h-[260px] font-mono text-sm"
            />
            {importError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {importError}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-3">
              <Button onClick={handleImport} disabled={importing} className="bg-amber-700 hover:bg-amber-800">
                {importing ? "Importing..." : "Import into Vault"}
              </Button>
              <Button asChild variant="outline">
                <Link href="/app/people">
                  Go to People Explorer
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
