import { SafeLink } from "@/components/layout/SafeLink";

const extraQuestions = [
  {question:"How do Queue requests and AI suggestions differ?",answer:"Requests you ask your AI to add are ordinary Queue items, marked added by your AI. Your AI’s own ideas are AI suggestions in your private Queue, hidden by default with a count; you can edit first, accept or dismiss them. Nothing runs before you accept. Needs your input is a flag on an item, never a state. Family-history conclusions stay on their records as AI proposal until you decide, never in the Queue."},
  { question: "What can my AI do here, and how do I limit it?",
    answer: "Your first AI starts with full tool access and no end date. Limit it in Settings → AI, or ask it to narrow its own access. Only you can restore access. A new connection starts with the limits of your most limited AI until you Restore it. It never permanently deletes anything or spends money for you. If you ask, it can publish or share something for you — it checks for private details first, and you can unpublish it any time." },
  {
    question: "Is this another family-tree site?",
    answer: "A tree can be one view, but the workspace is built for the trail behind it: sources, relationships, events, uncertainty, research questions, context, and stories.",
  },
  {
    question: "Does Family History replace my AI?",
    answer: "No. You choose the AI environment where you reason and research. Family History gives that work durable, structured context and a place to inspect and correct the result.",
  },
  {
    question: "Can my AI see another family’s records?",
    answer: "No. Sign-in selects one private vault on the server. The connection does not accept a user, workspace, or tenant ID from the AI.",
  },
  {
    question: "Will a source automatically become a fact?",
    answer: "No. Evidence, candidate conclusions, conflicts, confidence, and accepted understanding remain distinct so you can review what the record really supports.",
  },
  {
    question: "Can the AI publish or permanently delete for me?",
    answer: "With publishing permission, your AI can publish or unpublish stories. Living-person, readiness and second-review gates still apply. It cannot permanently delete records; archive and restore are reversible.",
  },
  {
    question: "Does it import directly from every genealogy provider?",
    answer: "No. A user-mediated FamilySearch capture workflow is available. Universal provider access, unattended research, and automatic import are not current claims.",
  },
  {
    question: "What can I use now?",
    answer: "The soft-launch workspace includes people and place records, source capture, research operations, a Queue with three work states and a Needs your input flag, story drafting and review, and a production-proven MCP foundation for compatible clients.",
  },
  {
    question: "Where should I start?",
    answer: "Begin with one person and a known relationship, preserve the source or question that brought you there, or connect a compatible AI and ask it for your Family History brief.",
  },
] as const;

export const questions = [
  { question: "Which AI can I use?", answer: "Use a compatible MCP client. Family History is not an AI itself. The Connect AI page has setup steps for supported clients." },
  { question: "How does my AI connect?", answer: "Follow your client’s steps on Connect AI, sign in and allow the connection. Your AI can then work with the records you deliberately save here; it does not inherit access to genealogy providers." },
  { question: "What can it do, and can I limit access?", answer: "Your first AI starts with full tool access and no end date: reading, saving, drafting, archiving and guarded story publishing. Limit or revoke access in Settings → AI, or ask the AI to narrow its own access. Only you can restore it. Permanent deletion and spending are never allowed." },
  { question: "Can I use Family History without AI?", answer: "Yes. Add, inspect, correct and organise records yourself. An AI connection is optional." },
  { question: "Is my family information private?", answer: "Your vault is private by default. An authorised AI can read core living-person details, with notes withheld. Loose context and media need review and AI-use permission. Publishing a story is explicit and does not publish the surrounding tree or sources." },
  ...extraQuestions,
] as const;

export function FaqList() {
  const row = ({ question, answer }: {question: string; answer: string}) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>;
  return <>{questions.slice(0, 5).map(row)}<details className="fh-more-faq"><summary>More questions about research and records</summary><div>{questions.slice(5).map(row)}</div></details></>;
}

export function FamilyHistoryFaq() {
  return (
    <section className="border-t border-[#d7cfbf] bg-[#f6efe1] py-20 sm:py-24" aria-labelledby="family-history-faq">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr]">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-[#6d6249]">Questions before you begin</p>
            <h2 id="family-history-faq" className="mt-5 text-4xl leading-tight text-[#1d212a] sm:text-5xl" data-display="true">
              A careful workspace should be easy to understand.
            </h2>
            <p className="mt-5 text-base leading-8 text-[#4e5a64]">
              Assisting your AI to assist you with Family History.
            </p>
            <SafeLink href="/ai" className="mt-7 inline-flex min-h-11 items-center rounded-full border border-[#234d5e] px-5 text-sm font-semibold text-[#234d5e] hover:bg-[#edf4f0]">
              See how the AI connection works
            </SafeLink>
          </div>
          <div className="divide-y divide-[#d7cfbf] border-y border-[#c9b791]">
            <FaqList />
          </div>
        </div>
      </div>
    </section>
  );
}
