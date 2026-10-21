import type { Metadata } from "next";
import { SafeLink as Link } from "@/components/layout/SafeLink";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { VaultStateCard } from "@/components/vault/VaultStateCard";
import { createPageMetadata } from "@/lib/seo";
import {
  getAuthedConvexClient,
  getConvexRuntimeIssue,
  getConvexUnavailableState,
  isConvexConfigured,
} from "@/lib/convex/server";
import { api } from "@/convex/_generated/api";
import { getVaultAccessContext } from "@/lib/vault/server";

export const metadata: Metadata = createPageMetadata({
  title: "Your stats",
  description: "How much of your family history is in your private workspace, and what your AI has been doing.",
  path: "/app/me",
});

/** One person's numbers: rendered per request and cached by nobody. */
export const dynamic = "force-dynamic";

const QUEUE_LABELS: Record<string, string> = {
  waiting_for_your_ai: "Waiting on your AI",
  working: "AI working",
  needs_you: "Needs your input",
  done: "Answered",
};

function formatCount(count: number, more: boolean) {
  return `${count.toLocaleString("en-US")}${more ? "+" : ""}`;
}

export default async function YourStatsPage() {
  if (!isConvexConfigured()) {
    const issue = getConvexUnavailableState("Your stats", "Your stats are counted from your private workspace.");
    return (
      <div className="p-6 sm:p-8">
        <VaultStateCard title={issue.title} description={issue.description} />
      </div>
    );
  }

  const client = await getAuthedConvexClient();
  const { vaultOwnerId } = await getVaultAccessContext();
  let stats;
  try {
    stats = await client.action(api.yourData.getYourStats, { vaultOwnerId });
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);
    return (
      <div className="p-6 sm:p-8">
        <VaultStateCard title={issue.title} description={issue.description} />
      </div>
    );
  }

  const tiles = [
    { label: "People", value: formatCount(stats.people.count, stats.people.more), href: "/app/people", note: `${stats.people.living.toLocaleString("en-US")} marked living` },
    { label: "Relationships", value: formatCount(stats.relationships.count, stats.relationships.more), href: "/app/people", note: "Couples and parent-child links" },
    { label: "Sources", value: formatCount(stats.sources.count, stats.sources.more), href: "/app/source-docs", note: `${formatCount(stats.citations.count, stats.citations.more)} citations` },
    { label: "Stories", value: formatCount(stats.stories.count, stats.stories.more), href: "/app/stories", note: `${stats.stories.byStatus.published ?? 0} published` },
    { label: "Queue", value: formatCount(stats.queue.count, stats.queue.more), href: "/app/queue", note: `${stats.queue.byState.needs_you ?? 0} need your input` },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-4 sm:p-8">
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-wide text-stone-500">Your stats</p>
        <h1 className="text-3xl font-semibold text-stone-900">Your family history, counted</h1>
        <p className="max-w-2xl text-stone-600">
          Everything here is private to you. Counts come straight from your workspace; very large
          collections show a plus sign once they pass what one page reads.
        </p>
      </header>

      <section aria-labelledby="records-heading" className="space-y-3">
        <h2 id="records-heading" className="text-lg font-semibold text-stone-900">Your records</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {tiles.map((tile) => (
            <li key={tile.label}>
              <Link
                href={tile.href}
                className="block min-h-[44px] rounded-lg border border-stone-200 bg-white p-4 hover:border-stone-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-700"
              >
                <span className="block text-sm text-stone-600">{tile.label}</span>
                <span className="block text-2xl font-semibold text-stone-900">{tile.value}</span>
                <span className="block text-xs text-stone-600">{tile.note}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="ai-heading" className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle id="ai-heading">Your AI</CardTitle>
            <CardDescription>What connected AIs have done for you.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-stone-700">
            <p>
              <strong>{stats.ai.activeConnections}</strong> active connection{stats.ai.activeConnections === 1 ? "" : "s"}.{" "}
              <Link className="underline" href="/app/settings/ai">Manage connections</Link>
            </p>
            <p>
              <strong>{formatCount(stats.ai.savesLast30Days, stats.ai.savesCapped)}</strong> saves in the last 30 days.
            </p>
            <p>
              <strong>{stats.people.byYourAi.toLocaleString("en-US")}</strong> people were added by your AI,{" "}
              {stats.people.fromImports.toLocaleString("en-US")} of them through an import.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Your Queue</CardTitle>
            <CardDescription>Work you handed to your AI.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm text-stone-700">
              {Object.entries(QUEUE_LABELS).map(([state, label]) => (
                <li key={state} className="flex justify-between">
                  <span>{label}</span>
                  <span className="font-medium">{stats.queue.byState[state] ?? 0}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>

      <p className="text-sm text-stone-600">
        Want a copy of everything? <Link className="underline" href="/app/settings/data">Your data</Link> has the export.
      </p>
    </div>
  );
}
