import { ClipboardList, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
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
  title: "Research",
  description: "Review AI-suggested tasks and research log activity across the vault.",
  path: "/app/research",
});

export const dynamic = "force-dynamic";

export default async function ResearchPage() {
  if (!isConvexConfigured()) {
    const issue = getConvexUnavailableState(
      "Research",
      "The research overview needs the canonical vault backend."
    );
    return (
      <div className="p-6 sm:p-8">
        <VaultStateCard title={issue.title} description={issue.description} />
      </div>
    );
  }

  const client = await getAuthedConvexClient();
  const { vaultOwnerId } = await getVaultAccessContext();
  let overview;

  try {
    overview = await client.query(api.vault.getResearchOverview, { vaultOwnerId });
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);

    return (
      <div className="p-6 sm:p-8">
        <VaultStateCard title={issue.title} description={issue.description} />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-8">
        <Badge variant="secondary" className="mb-3">Research ledger</Badge>
        <h1 className="text-3xl font-bold text-stone-900 sm:text-4xl">Research</h1>
        <p className="mt-2 max-w-2xl text-stone-500">
          Follow AI-suggested next steps and see how imports, context gathering, and narrative work accumulate around the same graph.
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <Card className="border-stone-200 bg-white">
          <CardHeader>
            <div className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-amber-700" />
              <CardTitle>Open Tasks</CardTitle>
            </div>
            <CardDescription>Actionable follow-up work attached to people in the vault.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {overview.tasks.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-stone-200 px-4 py-10 text-center text-sm text-stone-500">
                No open research tasks yet. Imports and AI tools will start creating follow-up work here.
              </div>
            ) : (
              overview.tasks.map((task) => (
                <div key={String(task._id)} className="rounded-2xl border border-stone-200 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-stone-900">{task.title}</p>
                      <p className="mt-1 text-sm text-stone-500">{task.person ? `${task.person.name.given} ${task.person.name.surname}` : "Global task"}</p>
                    </div>
                    <Badge variant="secondary">{task.priority}</Badge>
                  </div>
                  <p className="mt-3 text-sm text-stone-600">{task.description || task.type}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-stone-200 bg-white">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-700" />
              <CardTitle>Research Log</CardTitle>
            </div>
            <CardDescription>Completed ingestion and context-building activity across the vault.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {overview.logEntries.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-stone-200 px-4 py-10 text-center text-sm text-stone-500">
                No research log activity yet. Imports, place work, and stories will create entries here.
              </div>
            ) : (
              overview.logEntries.map((entry) => (
                <div key={String(entry._id)} className="rounded-2xl border border-stone-200 px-4 py-4">
                  <p className="font-medium text-stone-900">{entry.summary}</p>
                  <p className="mt-1 text-sm text-stone-500">{entry.activityType.replace(/_/g, " ")}</p>
                  {entry.person ? (
                    <p className="mt-2 text-sm text-stone-600">
                      {[entry.person.name.given, entry.person.name.surname].filter(Boolean).join(" ")}
                    </p>
                  ) : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
