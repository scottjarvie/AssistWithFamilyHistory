// Short lines are grounded in lib/site/ideas.ts and the Site Guide's building blocks.
export const MOTTO = "Assisting your AI to assist you with Family History.";
export const KEEPS = [
  {
    name: "People",
    text: "Names over time, relationships and the evidence behind them.",
  },
  {
    name: "Sources",
    text: "Original records, photos and memories, with where they came from.",
  },
  {
    name: "Claims",
    text: "What a source says, its support, confidence and review state.",
  },
  {
    name: "Questions",
    text: "Open research problems, plans and searches that came up empty.",
  },
  {
    name: "Research",
    text: "Your AI’s saved reports, with sources and reasoning.",
  },
  {
    name: "Places",
    text: "Locations in their time, with changing names and borders.",
  },
  {
    name: "Stories",
    text: "Private drafts and versions, each with its author.",
  },
] as const;
export const PARTS = [
  {
    id: "census",
    name: "Name the household",
    ai: "Reads names, ages and relationships.",
    kept: "The record’s words, with proposed links to people.",
    tags: ["People", "Sources", "Claims"],
    picture: "household",
  },
  {
    id: "brick-wall",
    name: "Follow the question",
    ai: "Weighs the evidence; plans the next search.",
    kept: "Every source and dead end already tried.",
    tags: ["Questions", "Research"],
    picture: "question",
  },
  {
    id: "queue",
    name: "Keep work moving",
    ai: "Works a job when you open a conversation.",
    kept: "Your Queue, progress and questions waiting for you.",
    tags: ["Questions", "Research"],
    picture: "queue",
  },
  {
    id: "context",
    name: "Place and era",
    ai: "Researches a place or trade in its time.",
    kept: "Background kept separate from evidence about a person.",
    tags: ["Places", "Research"],
    picture: "place",
  },
  {
    id: "photo",
    name: "Capture what you have",
    ai: "Describes a photo; reads the writing.",
    kept: "The original, private and unreviewed until you look.",
    tags: ["Sources", "People"],
    picture: "photo",
  },
  {
    id: "story",
    name: "Tell the story",
    ai: "Drafts a life from dates, places and documents.",
    kept: "A private draft, tied to the evidence used.",
    tags: ["Stories", "Claims"],
    picture: "story",
  },
] as const;
