import type { Metadata } from "next";
import Link from "next/link";
import { Bot, Filter, FolderSearch, Gauge, LogIn, Search, Sparkles, TableProperties, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { VaultStateCard } from "@/components/vault/VaultStateCard";
import { createPageMetadata } from "@/lib/seo";
import {
  getConvexClient,
  getConvexRuntimeIssue,
  getConvexUnavailableState,
  isConvexConfigured,
} from "@/lib/convex/server";
import { api } from "@/convex/_generated/api";
import { getVaultAccessContext } from "@/lib/vault/server";
import { OperationRowActions } from "@/components/vault/OperationRowActions";

export const metadata: Metadata = createPageMetadata({
  title: "Operations",
  description: "Run research operations across every person and provisional relative in your vault.",
  path: "/app/operations",
});

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  q?: string;
  type?: string;
  storyStatus?: string;
  staleOnly?: string;
  sortBy?: string;
  sortDirection?: string;
  missingCheck?: string;
}>;

export default async function OperationsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;

  if (!isConvexConfigured()) {
    const issue = getConvexUnavailableState(
      "Operations",
      "The operations console needs the canonical per-user vault backend."
    );
    return (
      <div className="p-6 sm:p-8">
        <VaultStateCard title={issue.title} description={issue.description} />
      </div>
    );
  }

  const client = getConvexClient();
  const accessContext = await getVaultAccessContext();
  const { vaultOwnerId } = accessContext;
  let queue;

  try {
    queue = await client.query(api.vault.getOperationsQueue, {
      vaultOwnerId,
      search: params.q || undefined,
      rowType: params.type === "person" || params.type === "provisional" ? params.type : undefined,
      storyStatus:
        params.storyStatus === "has_story" || params.storyStatus === "no_story"
          ? params.storyStatus
          : undefined,
      staleOnly: params.staleOnly === "true" ? true : undefined,
      sortBy:
        params.sortBy === "completion" ||
        params.sortBy === "lastTouched" ||
        params.sortBy === "sourceCount" ||
        params.sortBy === "storyReadiness" ||
        params.sortBy === "newestImport" ||
        params.sortBy === "missingCritical"
          ? params.sortBy
          : "missingCritical",
      sortDirection: params.sortDirection === "asc" || params.sortDirection === "desc" ? params.sortDirection : "desc",
      missingCheck: params.missingCheck || undefined,
    });
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);
    return (
      <div className="p-6 sm:p-8">
        <VaultStateCard title={issue.title} description={issue.description} />
      </div>
    );
  }

  const hasActiveFilters = Boolean(
    params.q ||
      params.type ||
      params.storyStatus ||
      params.staleOnly === "true" ||
      params.missingCheck
  );
  const isGuestVault = accessContext.mode === "anonymous";
  const sessionLabel =
    accessContext.mode === "user"
      ? "Signed-in vault"
      : accessContext.mode === "local"
        ? "Local development vault"
        : "Guest vault";
  const sessionDescription =
    accessContext.mode === "user"
      ? "You are viewing the private vault tied to your account."
      : accessContext.mode === "local"
        ? "Clerk is not configured, so this machine is using one shared local development vault."
        : "You are signed out and viewing a browser-only guest vault. It will not show data from a signed-in account unless you log in or import data into this guest vault.";

  return (
    <div className="p-4 sm:p-8">
      <section className="mb-8 rounded-[2rem] border border-stone-200 bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.16),_transparent_28%),linear-gradient(135deg,_rgba(255,255,255,0.96),_rgba(251,247,240,0.98))] px-6 py-7 shadow-sm">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <Badge variant="secondary" className="mb-4">Research operations backend</Badge>
            <h1 className="text-3xl font-bold text-stone-900 sm:text-4xl">Operations</h1>
            <p className="mt-2 max-w-4xl text-stone-500">
              Scan every person and provisional relative like a work queue. See what evidence exists, what record types likely apply, what is still missing, and what an AI agent or researcher should do next.
            </p>
            <div className="mt-5 max-w-3xl rounded-2xl border border-stone-200 bg-white/85 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.22em] text-stone-400">Current session</p>
                  <p className="mt-1 text-lg font-semibold text-stone-900">{sessionLabel}</p>
                  <p className="mt-1 text-sm text-stone-600">{sessionDescription}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {isGuestVault ? (
                    <Button asChild size="sm" className="bg-stone-900 text-white hover:bg-stone-800">
                      <Link href="/sign-in">
                        <LogIn className="h-4 w-4" />
                        Sign in to your vault
                      </Link>
                    </Button>
                  ) : null}
                  <Button asChild size="sm" variant="outline">
                    <Link href="/app/imports">
                      <Upload className="h-4 w-4" />
                      Import capture package
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[
              ["Visible rows", queue.summary.visibleRows],
              ["Provisional", queue.summary.provisionalRows],
              ["Missing required", queue.summary.missingRequired],
              ["Missing recommended", queue.summary.missingRecommended],
              ["Stale checks", queue.summary.staleChecks],
              ["Avg coverage", `${queue.summary.averageCompletion}%`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-stone-200 bg-white/90 px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-stone-400">{label}</p>
                <p className="mt-2 text-2xl font-semibold text-stone-900">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mb-6">
        <form className="rounded-[1.75rem] border border-stone-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 xl:grid-cols-[1.1fr_180px_180px_180px_190px_130px_130px_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <Input
                name="q"
                defaultValue={params.q}
                placeholder="Search names, places, relatives"
                className="pl-9"
              />
            </div>
            <select name="type" defaultValue={params.type || ""} className="h-10 rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-700">
              <option value="">All rows</option>
              <option value="person">Canonical people</option>
              <option value="provisional">Provisional relatives</option>
            </select>
            <select name="storyStatus" defaultValue={params.storyStatus || ""} className="h-10 rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-700">
              <option value="">Any story state</option>
              <option value="has_story">Has story</option>
              <option value="no_story">No story</option>
            </select>
            <select name="missingCheck" defaultValue={params.missingCheck || ""} className="h-10 rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-700">
              <option value="">Any missing check</option>
              <option value="identity_review">Identity review</option>
              <option value="biography">Biography</option>
              <option value="timeline">Timeline</option>
              <option value="birth_record">Birth record</option>
              <option value="death_record">Death record</option>
              <option value="census">Census</option>
              <option value="church_records">Church records</option>
            </select>
            <select name="sortBy" defaultValue={params.sortBy || "missingCritical"} className="h-10 rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-700">
              <option value="missingCritical">Sort: Missing critical</option>
              <option value="completion">Sort: Completion</option>
              <option value="lastTouched">Sort: Last touched</option>
              <option value="sourceCount">Sort: Source count</option>
              <option value="storyReadiness">Sort: Story readiness</option>
              <option value="newestImport">Sort: Newest import</option>
            </select>
            <select name="sortDirection" defaultValue={params.sortDirection || "desc"} className="h-10 rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-700">
              <option value="desc">Desc</option>
              <option value="asc">Asc</option>
            </select>
            <select name="staleOnly" defaultValue={params.staleOnly || ""} className="h-10 rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-700">
              <option value="">Any freshness</option>
              <option value="true">Stale only</option>
            </select>
            <button className="inline-flex h-10 items-center justify-center rounded-md bg-stone-900 px-4 text-sm font-medium text-white hover:bg-stone-800">
              Apply
            </button>
          </div>
        </form>
      </section>

      <section className="mb-6 grid gap-5 lg:grid-cols-3">
        <Card className="border-stone-200">
          <CardHeader>
            <div className="flex items-center gap-2">
              <TableProperties className="h-5 w-5 text-amber-700" />
              <CardTitle>Queue Model</CardTitle>
            </div>
            <CardDescription>Missing work stays visible. Completed work stops dominating the queue.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-stone-600">
            <p>Canonical people and provisional relatives share the same operational surface, so unresolved identities show up alongside established ancestors.</p>
            <p>Coverage is inferred automatically from sources, places, stories, documents, relationships, and imports, then can be overridden by the user or an AI agent.</p>
          </CardContent>
        </Card>
        <Card className="border-stone-200">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-amber-700" />
              <CardTitle>AI Hand-off</CardTitle>
            </div>
            <CardDescription>Use the row actions to open the person workspace or export a context pack for another agent.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-stone-600">
            <p>Rows include the exact missing critical checks and the next recommended actions. That gives another tool enough structure to decide what to research next.</p>
          </CardContent>
        </Card>
        <Card className="border-stone-200">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Gauge className="h-5 w-5 text-amber-700" />
              <CardTitle>Progress Logic</CardTitle>
            </div>
            <CardDescription>Coverage is intentionally opinionated, not just a raw count of attached records.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-stone-600">
            <p>Required checks drive completion more than optional ones, stale work is flagged separately, and stories/documents feed the same operations view instead of living in a silo.</p>
          </CardContent>
        </Card>
      </section>

      <section className="overflow-hidden rounded-[1.75rem] border border-stone-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-stone-200 text-sm">
            <thead className="bg-stone-50">
              <tr className="text-left text-[11px] uppercase tracking-[0.2em] text-stone-500">
                <th className="px-4 py-4 font-medium">Entry</th>
                <th className="px-4 py-4 font-medium">Type</th>
                <th className="px-4 py-4 font-medium">Places</th>
                <th className="px-4 py-4 font-medium">Coverage</th>
                <th className="px-4 py-4 font-medium">Evidence</th>
                <th className="px-4 py-4 font-medium">Missing Checks</th>
                <th className="px-4 py-4 font-medium">Next Action</th>
                <th className="px-4 py-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {queue.rows.map((row) => (
                <tr key={row.id} className="align-top">
                  <td className="px-4 py-4">
                    <div className="space-y-1">
                      <p className="font-medium text-stone-900">{row.displayName}</p>
                      <p className="text-stone-500">{row.lifespan}</p>
                      {row.anchorPersonFsId && row.rowType === "provisional" ? (
                        <p className="text-xs text-stone-400">Anchor: {row.anchorPersonFsId}</p>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <Badge variant="secondary">{row.rowType}</Badge>
                    <p className="mt-2 text-xs text-stone-500">{row.badge}</p>
                  </td>
                  <td className="px-4 py-4 text-stone-600">
                    {row.keyPlaces.length > 0 ? row.keyPlaces.join(" • ") : "No known places"}
                  </td>
                  <td className="px-4 py-4">
                    <div className="space-y-2">
                      <div className="h-2 overflow-hidden rounded-full bg-stone-100">
                        <div
                          className="h-full rounded-full bg-amber-500"
                          style={{ width: `${Math.max(row.completionPercent, row.rowType === "provisional" ? 8 : 4)}%` }}
                        />
                      </div>
                      <p className="font-medium text-stone-900">{row.completionPercent}%</p>
                      {row.staleChecksCount > 0 ? (
                        <p className="text-xs text-amber-700">{row.staleChecksCount} stale checks</p>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-stone-600">
                    <p>{row.sourceCount} sources</p>
                    <p>{row.memoryCount} memories</p>
                    <p>{row.documentCount} documents</p>
                    <p>{row.storyCount} stories</p>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-2">
                      {row.missingCritical.length === 0 ? (
                        <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">None critical</Badge>
                      ) : (
                        row.missingCritical.slice(0, 4).map((check) => (
                          <Badge key={`${row.id}-${check}`} variant="outline" className="border-amber-200 text-amber-800">
                            {check.replace(/_/g, " ")}
                          </Badge>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-stone-600">
                    <div className="space-y-2">
                      {row.nextActions.length > 0 ? (
                        row.nextActions.slice(0, 2).map((action: string) => (
                          <p key={`${row.id}-${action}`} className="rounded-xl bg-stone-50 px-3 py-2">
                            {action}
                          </p>
                        ))
                      ) : (
                        <p className="rounded-xl bg-stone-50 px-3 py-2">Queue is clear for this row.</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <OperationRowActions
                      rowType={row.rowType}
                      personFsId={row.personFsId}
                      provisionalId={row.rowType === "provisional" ? row.id : undefined}
                      anchorPersonFsId={row.anchorPersonFsId || undefined}
                      missingCritical={row.missingCritical}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {queue.rows.length === 0 && hasActiveFilters ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center text-stone-500">
            <FolderSearch className="h-10 w-10 text-stone-300" />
            <p className="text-lg font-medium text-stone-900">No rows match this filter</p>
            <p>Try widening the search or clearing filters to see the rest of this vault.</p>
          </div>
        ) : null}
        {queue.rows.length === 0 && !hasActiveFilters ? (
          <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
            <FolderSearch className="h-10 w-10 text-stone-300" />
            <div className="space-y-2">
              <p className="text-lg font-medium text-stone-900">
                {isGuestVault ? "This guest vault does not have any people yet" : "This vault does not have any people yet"}
              </p>
              <p className="max-w-2xl text-stone-500">
                {isGuestVault
                  ? "You are currently signed out, so this browser is showing its own guest vault. Sign in to view your account vault, or import a FamilySearch capture package here to start a separate guest session."
                  : "Import a FamilySearch capture package to populate the queue with people, provisional relatives, research checks, and next actions."}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {isGuestVault ? (
                <Button asChild className="bg-stone-900 text-white hover:bg-stone-800">
                  <Link href="/sign-in">
                    <LogIn className="h-4 w-4" />
                    Sign in
                  </Link>
                </Button>
              ) : null}
              <Button asChild variant="outline">
                <Link href="/app/imports">
                  <Upload className="h-4 w-4" />
                  Import capture package
                </Link>
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="mt-8 grid gap-5 lg:grid-cols-2">
        <Card className="border-stone-200 bg-white/90">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Filter className="h-5 w-5 text-amber-700" />
              <CardTitle>How To Use This Queue</CardTitle>
            </div>
            <CardDescription>Start with required gaps, then use place and story work to deepen context.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-7 text-stone-600">
            <p>Use the first pass to close identity, biography, timeline, and major record gaps. Once those are stable, the same person workspace becomes the launch point for place stories, contextualized dossiers, and longer narrative work.</p>
          </CardContent>
        </Card>
        <Card className="border-stone-200 bg-gradient-to-br from-white to-amber-50/60">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-700" />
              <CardTitle>Best Paired Workflow</CardTitle>
            </div>
            <CardDescription>Operations keeps the research graph honest. Story Writer turns the strongest rows into usable narrative outputs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link href="/app/story-writer" className="inline-flex items-center gap-2 text-sm font-medium text-amber-800 hover:text-amber-900">
              Open Story Writer
            </Link>
            <p className="text-sm leading-7 text-stone-600">
              The queue should tell you which people are ready for narrative drafting and which still need more evidence, place context, or relationship review first.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
