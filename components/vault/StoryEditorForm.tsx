"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const STORY_TYPES = [
  "biography",
  "day_in_life",
  "historical_context",
  "migration_story",
  "family_narrative",
  "anecdote",
  "timeline",
  "letter",
  "interview",
  "research_summary",
  "custom",
];

export function StoryEditorForm({
  story,
}: {
  story: {
    _id: string;
    title: string;
    content: string;
    type: string;
    tags?: string[];
  };
}) {
  const router = useRouter();
  const [title, setTitle] = useState(story.title);
  const [type, setType] = useState(story.type);
  const [content, setContent] = useState(story.content);
  const [tags, setTags] = useState((story.tags || []).join(", "));
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const response = await fetch(`/api/stories/${story._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          type,
          content,
          tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        }),
      });
      const payload = await response.json();

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Unable to save story");
      }

      toast.success("Story saved");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save story");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
        <div className="space-y-2">
          <Label htmlFor="story-title">Title</Label>
          <Input id="story-title" value={title} onChange={(event) => setTitle(event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="story-type">Type</Label>
          <select
            id="story-type"
            value={type}
            onChange={(event) => setType(event.target.value)}
            className="h-9 w-full rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-700"
          >
            {STORY_TYPES.map((option) => (
              <option key={option} value={option}>
                {option.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="story-tags">Tags</Label>
        <Input
          id="story-tags"
          value={tags}
          onChange={(event) => setTags(event.target.value)}
          placeholder="migration, church, childhood"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="story-content">Markdown story content</Label>
        <Textarea
          id="story-content"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          className="min-h-[520px] text-sm leading-6"
        />
      </div>

      <Button onClick={handleSave} disabled={saving || !title.trim() || !content.trim()} className="bg-stone-900 hover:bg-stone-800">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save story
      </Button>
    </div>
  );
}
