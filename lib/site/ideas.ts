/**
 * Ideas and Usage content (Core §6). Each idea names only what exists today:
 * every situation here maps to a live Family History tool or page.
 */
export const IDEAS_INTRO =
  "Your AI can already read records, reason about evidence and write. What it cannot do on its own is remember your family from one conversation to the next. Family History is that memory: private, sourced, and yours.";

export type Idea = { id: string; situation: string; ai: string; site: string; prompt: string };

export const IDEAS: readonly Idea[] = [
  {
    id: "census",
    situation: "You found a census page with the whole household on it",
    ai: "Reads the page and lists everyone, with ages, birthplaces and relationships to the head.",
    site: "Keeps the record's own words, each person exactly as the page names them, and the claims your AI drew from it, with links to your people left as proposals for you.",
    prompt: "Save this census page to Family History: the record first, then the household, then the claims.",
  },
  {
    id: "brick-wall",
    situation: "One ancestor has stopped you for years",
    ai: "Weighs what is proven against what is only claimed and suggests where to look next.",
    site: "Holds every source and dead end already tried, so the next session starts where the last one stopped.",
    prompt: "Read everything Family History has on my great-grandmother and plan the next three record searches.",
  },
  {
    id: "story",
    situation: "You want a grandparent's life told, not just listed",
    ai: "Writes a readable draft from dates, places and documents.",
    site: "Keeps the draft private, tied to the evidence it used, until you review it.",
    prompt: "Draft a short story of my grandfather's emigration from the evidence in Family History. Don't invent details.",
  },
  {
    id: "queue",
    situation: "You have research jobs you want done later",
    ai: "Works through a job when you open a conversation with it.",
    site: "Holds your Queue of jobs, what your AI did with each, and the questions it left for you.",
    prompt: "Check my Family History Queue and work the first job waiting for you.",
  },
  {
    id: "context",
    situation: "You want to know what life was like where they lived",
    ai: "Researches a parish, a trade or a migration in its time.",
    site: "Keeps that background as research packs and topics in your Library, separate from evidence about any one person.",
    prompt: "Research daily life in my ancestors' parish in the 1870s and save it to my Family History Library.",
  },
  {
    id: "photo",
    situation: "You have an old photo or document scan",
    ai: "Describes it and reads any writing on it.",
    site: "Stores the original privately, unreviewed until you look, and links it to the people in it.",
    prompt: "Upload this scan to Family History for my grandmother and tell me what it says.",
  },
];
