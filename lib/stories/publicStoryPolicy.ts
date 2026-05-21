import type { StoryStatus } from "./publishSafety";

export function canRenderPublicStory(status: StoryStatus) {
  return status === "published";
}

export type PublicStoryMetadataInput = {
  story: {
    status: StoryStatus;
    title: string;
    content?: string;
    publicIndexing?: "noindex" | "index";
  };
  person?: {
    displayName?: string;
    lifespan?: string;
  } | null;
};

function summarizeContent(content: string | undefined) {
  const normalized = (content ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return "A published ancestor story with supporting evidence and historical context.";
  return normalized.length > 155 ? `${normalized.slice(0, 152).trim()}...` : normalized;
}

export function buildPublicStorySharePreview(input: PublicStoryMetadataInput) {
  const personLabel = input.person?.displayName ?? "Family story";
  const lifespan = input.person?.lifespan ? ` (${input.person.lifespan})` : "";

  if (!canRenderPublicStory(input.story.status)) {
    return {
      title: "Story not available",
      description: "This story is not published.",
      eyebrow: "Private story",
    };
  }

  return {
    title: input.story.title,
    description: summarizeContent(input.story.content),
    eyebrow: `${personLabel}${lifespan}`,
  };
}

export function buildPublicStoryMetadata(input: PublicStoryMetadataInput) {
  if (!canRenderPublicStory(input.story.status)) {
    return {
      title: "Story not available",
      description: "This story is not published.",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const personPrefix = input.person?.displayName ? `${input.person.displayName}: ` : "";
  const shouldIndex = input.story.publicIndexing === "index";
  return {
    title: `${personPrefix}${input.story.title}`,
    description: summarizeContent(input.story.content),
    robots: {
      index: shouldIndex,
      follow: shouldIndex,
    },
  };
}
