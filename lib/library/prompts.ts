/**
 * The Prompts shelf of the Library: prompts this product ships for a person
 * to copy into their own AI. A prompt is shown only when every tool it names
 * is in the live catalogue (lib/mcp/catalog.ts): true or absent (Core §10).
 */
import { findTool } from "@/lib/mcp/catalog";
import { analyzePrompt } from "@/lib/prompts/analyzePrompt";

export type LibraryPrompt = {
  id: string;
  title: string;
  useWhen: string;
  text: string;
  /** Family History tools the prompt asks the AI to use. */
  tools: readonly string[];
};

export const LIBRARY_PROMPTS: readonly LibraryPrompt[] = [
  {
    id: "import-whole-tree",
    title: "Bring my whole FamilySearch tree in",
    useWhen: "Your AI can see FamilySearch in your browser and you want every person here.",
    tools: ["family_history_begin_tree_import", "family_history_import_tree_batch", "family_history_get_tree_import"],
    text: `I'm signed in to FamilySearch. Please bring my family tree into Assist With Family History.

Start with me (or the person I name) and walk outward: my direct ancestors, their children and descendants, and cousins. Work at a normal reading pace.

1. Call family_history_begin_tree_import with system "familysearch" and an importKey based on the starting person's PID.
2. For each batch of up to 500 records, send sources first, then people (every name with its type, every fact with its date and place, and each person's PID as the key), then couples and one parent-child row per parent with the lineage, then citations, notes and photo references.
3. Send batchIndex = nextBatchIndex and a cursor that says where you are, so you can resume.
4. Resend any row that failed once the thing it points at exists. Mark the last batch final.
5. Tell me how many people arrived and how many possible duplicates are waiting for me to review. Do not merge anyone.`,
  },
  {
    id: "census-household",
    title: "Save a census page or family group sheet",
    useWhen: "One record names a whole household.",
    tools: ["family_history_search", "family_history_save_records"],
    text: `Here is a record that names several people. Please save it to Family History with family_history_save_records in one call.

Search first so you reuse people who are already there. Store the record's own words first: the indexed fields or a transcription, and each person exactly as the record names them. Then add the claims, each quoting the original text. Keep your interpretation separate, as an ai_reading. Leave any link between a person in the record and a person in my tree as a proposal for me.`,
  },
  {
    id: "brick-wall",
    title: "Work a brick wall",
    useWhen: "You are stuck on one ancestor.",
    tools: ["family_history_get_context", "family_history_save_research_work"],
    text: `Read everything Family History has on this person with family_history_get_context. List what is proven, what is only claimed, and what conflicts. Suggest three to five specific records to look for next and why each could break the wall. Save the plan with family_history_save_research_work, and record dead ends honestly.`,
  },
  {
    id: "story-draft",
    title: "Draft a story from the evidence",
    useWhen: "A person's life is well sourced and you want it told.",
    tools: ["family_history_get_context", "family_history_save_story_work"],
    text: `Using only what Family History holds for this person (read it with family_history_get_context), write a short private story draft. Say where the evidence is thin rather than inventing detail, and keep living people out. Save it as a draft with family_history_save_story_work for me to review. Do not publish.`,
  },
  {
    id: "research-dossier",
    title: "Write a research dossier",
    useWhen: "You want a biography, timeline, relations and next steps from a person's sources.",
    tools: ["family_history_get_context"],
    text: `Read this person's sources with family_history_get_context, then follow these instructions.\n\n${analyzePrompt}`,
  },
];

/** The prompts whose tools all exist right now. */
export function availableLibraryPrompts(): LibraryPrompt[] {
  return LIBRARY_PROMPTS.filter((prompt) => prompt.tools.every((tool) => Boolean(findTool(tool))));
}
