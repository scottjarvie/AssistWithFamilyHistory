export type StoryWriterMode = "short_story" | "narrative_draft" | "research_gap_notes";

export const STORY_WRITER_MODES: Record<
  StoryWriterMode,
  {
    title: string;
    description: string;
    storyType: "biography" | "family_narrative" | "research_summary";
    outputLabel: string;
  }
> = {
  short_story: {
    title: "Short Ancestor Story",
    description: "A concise narrative you could share with relatives or use as the opening of a longer story.",
    storyType: "biography",
    outputLabel: "short ancestor story",
  },
  narrative_draft: {
    title: "Long Narrative Draft",
    description: "A fuller narrative draft that connects events, places, and relationships into a readable life story.",
    storyType: "family_narrative",
    outputLabel: "long narrative draft",
  },
  research_gap_notes: {
    title: "Research-Gap Notes",
    description: "A research-aware memo that highlights conflicts, missing facts, and what to investigate next.",
    storyType: "research_summary",
    outputLabel: "research-gap notes",
  },
};

export const STORY_WRITER_SYSTEM_PROMPT = `You are a careful family-history narrative assistant.
Only use information supported by the supplied context pack.
Do not invent names, dates, places, motives, or dialogue.
If evidence is incomplete or conflicting, say so plainly.
Prefer readable prose, but keep claims traceable to the context pack.`;

export function buildStoryWriterPrompt(mode: StoryWriterMode, personName: string) {
  switch (mode) {
    case "short_story":
      return `Write a short ancestor story about ${personName}.

Requirements:
- 3 to 5 paragraphs.
- Use vivid but restrained prose grounded in the evidence.
- Connect the person's life to the places, relationships, and time periods in the context pack.
- Call out uncertainty where the evidence is incomplete.
- End with 2 or 3 bullet points titled "Research gaps" that note what still needs verification.`;
    case "narrative_draft":
      return `Write a long narrative draft about ${personName}.

Requirements:
- Organize the story in clear sections with Markdown headings.
- Build the narrative from the person's timeline, places, relationships, memories, and derived documents.
- Explain how places and historical context shaped the person's life.
- Include a final section titled "Evidence limits and open questions".
- Do not overstate unsupported conclusions.`;
    case "research_gap_notes":
      return `Write research-gap notes for ${personName}.

Requirements:
- Start with a short summary of the strongest confirmed facts.
- Then list the main conflicts, ambiguities, and missing evidence.
- Group research recommendations under clear headings such as identity, relationships, places, and records to seek.
- Keep the output practical for a researcher or downstream AI agent.`;
  }
}

export function getStoryTitle(personName: string, mode: StoryWriterMode) {
  const modeTitle = STORY_WRITER_MODES[mode].title;
  return `${personName} — ${modeTitle}`;
}
