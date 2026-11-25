"use client";

import { useEffect, useState } from "react";
import { loadPersonStoryPage } from "@/app/app/people/actions";
import { SafeLink } from "@/components/layout/SafeLink";
import { Prose } from "@/components/prose/Prose";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { PERSON_STORY_PAGE_SIZE } from "@/lib/records/personStories";
import { publicStoryPath } from "@/lib/stories/slug";

type Story = Pick<Doc<"stories">, "_id" | "title" | "type" | "status" | "content" | "publicSlug">;

export function PersonStoryCards({ stories }: { stories: Story[] }) {
  return stories.map(story => (
    <Card key={String(story._id)} className="border-border">
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>{story.title}</CardTitle>
        <CardDescription>{story.type.replace(/_/g, " ")} · {story.status}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Prose markdown={story.content} variant="compact" className="text-sm text-muted-foreground" />
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="outline" size="sm">
            <SafeLink href={`/app/stories/${story._id}`}>Review in Story Studio</SafeLink>
          </Button>
          {story.status === "published" && (
            <Button asChild variant="outline" size="sm">
              <SafeLink href={publicStoryPath(story.publicSlug ?? String(story._id))} target="_blank">Open public page</SafeLink>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  ));
}

export function DeferredPersonStoryCards({ personId, storyIds, owner }: {
  personId: Id<"persons">;
  storyIds: Id<"stories">[];
  owner: string;
}) {
  const [offset, setOffset] = useState(0);
  const [result, setResult] = useState<{ stories: Story[]; completedOffset: number; failed: boolean }>({
    stories: [], completedOffset: -1, failed: false,
  });

  useEffect(() => {
    let current = true;
    const ids = storyIds.slice(offset, offset + PERSON_STORY_PAGE_SIZE);
    async function load() {
      try {
        const page = await loadPersonStoryPage(personId, ids, owner);
        if (page && current) {
          setResult(previous => ({ stories: [...previous.stories.slice(0, offset), ...page], completedOffset: offset, failed: false }));
          return;
        }
      } catch {
        // The session or a story may have changed since the Overview loaded.
      }
      if (current) setResult(previous => ({ ...previous, completedOffset: offset, failed: true }));
    }
    void load();
    return () => { current = false; };
  }, [offset, owner, personId, storyIds]);

  const pending = result.completedOffset !== offset;
  return <>
    <PersonStoryCards stories={result.stories} />
    {pending ? <p role="status" className="text-sm text-muted-foreground">Loading stories…</p>
      : result.failed ? <p role="alert" className="text-sm text-annotation">Failed to load stories. Reload this person to continue.</p>
      : result.stories.length < storyIds.length && (
        <Button variant="outline" onClick={() => setOffset(result.stories.length)}>Load more</Button>
      )}
  </>;
}
