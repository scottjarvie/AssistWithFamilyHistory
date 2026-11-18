import { SafeLink } from "@/components/layout/SafeLink";
import { PartPicture } from "./PartPicture";
export const EVIDENCE_EXAMPLES = [
  {
    id: "birth-years", title: "Two birth years, one open question", picture: "household",
    prompt: "Compare the saved birth-year claims for Ellen Ward. Quote each source and citation, separate what the record says from our inference, and explain what evidence could resolve the conflict. Leave the conclusion open.",
    context: ["1851 census, page 8: Ellen is listed as age 9; about 1842 is an inference.", "Headstone photo and transcription: ‘born 1840’; saved as a competing claim.", "Open Question: which birth year is better supported? Neither claim is accepted."],
    difficulty: "Challenging: no birth or baptism record is saved. A precise year needs stronger evidence.",
    next: "Next level: compare who supplied each date, how close the record was to the event, and which original record to seek next.",
  },
  {
    id: "possible-match", title: "Resume a possible identity match", picture: "question",
    prompt: "Resume the saved Question about whether the two Ellen Ward records describe the same person. Use earlier positive and negative searches, list evidence for and against, and plan the next three searches. Keep both people separate for my review.",
    context: ["Two separate People: Ellen Ward in a census household and Ellen Ward in a marriage entry.", "Saved Research: a parish-index search found a candidate with a matching father’s name; surname alone is not proof.", "Research log: no entry found in the 1839–1843 baptism index; original register pages and adjacent parishes have not been checked."],
    difficulty: "Challenging: an index miss does not prove absence. The identity match stays a proposal, never an automatic merge.",
    next: "Next level: rank the searches by the evidence they could rule in or out, including the index’s coverage gaps.",
  },
] as const;
export function EvidenceExamples({ showAll = true }: { showAll?: boolean }) {
  return <section className="fh-evidence-examples" aria-labelledby="fh-examples-heading">
    <h2 id="fh-examples-heading">Start with a question. Bring the evidence.</h2>
    <p className="fh-hint">Fictional examples using records deliberately saved in Family History. Ask your own connected AI; chats are not saved automatically.</p>
    <div className="fh-example-grid">{EVIDENCE_EXAMPLES.map(example => <article id={example.id} key={example.id}>
      <PartPicture kind={example.picture} /><h3>{example.title}</h3>
      <p className="fh-prompt">“{example.prompt}”</p>
      <h4>Saved context available to your AI</h4><ul>{example.context.map(line => <li key={line}>{line}</li>)}</ul>
      <p className="fh-difficulty">{example.difficulty}</p><p>{example.next}</p>
    </article>)}</div>
    {showAll && <SafeLink className="fh-more" href="/ideas-and-usage">Explore Ideas and Usage →</SafeLink>}
  </section>;
}
