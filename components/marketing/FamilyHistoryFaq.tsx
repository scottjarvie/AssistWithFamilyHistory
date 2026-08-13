import { SafeLink } from "@/components/layout/SafeLink";

const questions = [
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
    question: "Can the AI publish or delete for me?",
    answer: "Not through the current connection. Story saves remain private drafts or review requests; publication and destructive work keep their human gates.",
  },
  {
    question: "Does it import directly from every genealogy provider?",
    answer: "No. A user-mediated FamilySearch capture workflow is available. Universal provider access, unattended research, and automatic import are not current claims.",
  },
  {
    question: "What can I use now?",
    answer: "The soft-launch workspace includes people and place records, source capture, research operations, a four-state Queue, story drafting and review, and a production-proven MCP foundation for compatible clients.",
  },
  {
    question: "Where should I start?",
    answer: "Begin with one person and a known relationship, preserve the source or question that brought you there, or connect a compatible AI and ask it for your Family History brief.",
  },
] as const;

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
              Assist your AI, so it can assist you with family history—without confusing help with authority.
            </p>
            <SafeLink href="/ai" className="mt-7 inline-flex min-h-11 items-center rounded-full border border-[#234d5e] px-5 text-sm font-semibold text-[#234d5e] hover:bg-[#edf4f0]">
              See how the AI connection works
            </SafeLink>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {questions.map(({ question, answer }) => (
              <article key={question} className="border border-[#c9b791] bg-[#fffaf2] p-5 shadow-[0_20px_35px_-34px_#111]">
                <h3 className="text-xl leading-tight text-[#24323e]" data-display="true">{question}</h3>
                <p className="mt-3 text-sm leading-6 text-[#5d5548]">{answer}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
