import type { StoryStatus } from "./publishSafety";

export function canRenderPublicStory(status: StoryStatus) {
  return status === "published";
}
