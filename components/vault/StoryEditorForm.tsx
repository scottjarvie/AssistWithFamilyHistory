"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { Eye, EyeOff, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Prose } from "@/components/prose/Prose";

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
  readonlyPreview = false,
}: {
  readonlyPreview?: boolean;
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
  const [previewChoice,setPreviewChoice]=useState<boolean|null>(null);
  const [wideColumn,setWideColumn]=useState(false);
  const root=useRef<HTMLDivElement>(null);
  useEffect(()=>{const node=root.current;if(!node)return;const observer=new ResizeObserver(([entry])=>setWideColumn(entry.contentRect.width>=768));observer.observe(node);return()=>observer.disconnect();},[]);
  const showPreview=previewChoice??wideColumn;

  async function handleSave() {
    if (readonlyPreview) return;
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
    <div ref={root} className="@container space-y-4">
      <div className="grid gap-4 @[40rem]:grid-cols-[minmax(0,1fr)_12rem]">
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
            className="h-11 md:pointer-fine:h-9 w-full rounded-md border border-border bg-card px-3 text-base md:pointer-fine:text-sm text-foreground"
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
        <div className="flex items-center justify-between">
          <Label htmlFor="story-content">Markdown story content</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setPreviewChoice(!showPreview)}
            className="text-muted-foreground"
          >
            {showPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {showPreview ? "Hide preview" : "Show preview"}
          </Button>
        </div>
        <div className={showPreview ? "grid gap-4 @[48rem]:grid-cols-2" : ""}>
          <Textarea
            id="story-content"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            className="min-h-[520px] text-sm leading-6"
          />
          {showPreview ? (
            <div className="min-h-[520px] overflow-auto rounded-md border border-border bg-card px-5 py-4">
              {content.trim() ? (
                <Prose markdown={content} variant="compact" />
              ) : (
                <p className="text-sm text-muted-foreground">Start typing to see the rendered story…</p>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <Button onClick={handleSave} disabled={readonlyPreview || saving || !title.trim() || !content.trim()} className="min-h-11">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save story
      </Button>
    </div>
  );
}
