import type { StoryStatus } from "./publishSafety";

export function canRenderPublicStory(status: StoryStatus) {
  return status === "published";
}

export type PublicStoryMetadataInput = {
  story: {
    status: StoryStatus;
    title: string;
    content?: string;
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
  return {
    title: `${personPrefix}${input.story.title}`,
    description: summarizeContent(input.story.content),
    robots: {
      index: false,
      follow: false,
    },
  };
}
