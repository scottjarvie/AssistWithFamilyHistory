export function slugifyStoryPart(value: string | undefined) {
  return (value || "story")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "story";
}

export function getStoryIdSuffix(storyId: string) {
  return storyId.replace(/[^a-z0-9]/gi, "").slice(-8).toLowerCase() || "story";
}

export function buildStoryPublicSlug(input: {
  storyId: string;
  title: string;
  personName?: string;
}) {
  const base = slugifyStoryPart(input.personName ? `${input.personName} ${input.title}` : input.title);
  return `${base}-${getStoryIdSuffix(input.storyId)}`;
}

export function publicStoryPath(identifier: string) {
  return `/stories/${identifier}`;
}
