import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, BookOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { VaultStateCard } from "@/components/vault/VaultStateCard";
import { api } from "@/convex/_generated/api";
import { getConvexClient, getConvexRuntimeIssue, getConvexUnavailableState, isConvexConfigured } from "@/lib/convex/server";
import { createPageMetadata } from "@/lib/seo";
import { getVaultAccessContext } from "@/lib/vault/server";

export const metadata: Metadata = createPageMetadata({
  title: "Story Writer",
  description: "Choose a person and draft a story from the Research Vault context pack.",
  path: "/app/story-writer",
});

export const dynamic = "force-dynamic";

export default async function StoryWriterPage() {
  if (!isConvexConfigured()) {
    const issue = getConvexUnavailableState(
      "Story Writer",
      "Story Writer needs the canonical vault backend and person context packs."
    );
    return (
      <div className="p-6 sm:p-8">
        <VaultStateCard title={issue.title} description={issue.description} />
      </div>
    );
  }

  const client = getConvexClient();
  const { vaultOwnerId } = await getVaultAccessContext();

  try {
    const people = await client.query(api.vault.getPeopleExplorer, {
      vaultOwnerId,
      limit: 24,
    });

    return (
      <div className="p-4 sm:p-8">
        <section className="mb-8 rounded-[2rem] border border-stone-200 bg-white px-6 py-6 shadow-sm">
          <Badge variant="secondary" className="mb-4">Derived outputs</Badge>
          <h1 className="text-3xl font-bold text-stone-900 sm:text-4xl">Story Writer</h1>
          <p className="mt-2 max-w-3xl text-stone-500">
            Choose a person with enough evidence, places, and memories to draft a story from the context pack.
          </p>
        </section>

        <div className="grid gap-5 xl:grid-cols-2">
          {people.length === 0 ? (
            <Card className="col-span-full border-dashed">
              <CardContent className="py-14 text-center text-stone-500">
                Import a FamilySearch capture first so Story Writer has a person context pack to work from.
              </CardContent>
            </Card>
          ) : (
            people.map((person) => (
              <Card key={String(person._id)} className="border-stone-200 bg-white shadow-sm">
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                        <BookOpen className="h-5 w-5" />
                      </div>
                      <CardTitle>{person.displayName}</CardTitle>
                      <CardDescription>
                        {person.stats.sources} sources · {person.stats.memories} memories · {person.stats.documents} documents
                      </CardDescription>
                    </div>
                    <Badge variant="secondary">{person.fsId || "No FS ID"}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <Button asChild className="w-full justify-between bg-amber-700 hover:bg-amber-800">
                    <Link href={`/app/people/${person.routeId}/story-writer`}>
                      Open Story Writer
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    );
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);
    return (
      <div className="p-6 sm:p-8">
        <VaultStateCard title={issue.title} description={issue.description} />
      </div>
    );
  }
}
