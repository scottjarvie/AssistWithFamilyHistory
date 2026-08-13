import { SafeLink } from "@/components/layout/SafeLink";
import { ArrowRight, CheckCircle2, Clock3, Search } from "lucide-react";

type StageStatus = "working" | "in-progress" | "exploring";

interface StageFeature {
  name: string;
  status: StageStatus;
  href?: string;
}

interface JourneyStage {
  label: string;
  summary: string;
  icon: typeof CheckCircle2;
  borderClass: string;
  headingClass: string;
  features: StageFeature[];
}

const journeyStages: JourneyStage[] = [
  {
    label: "Current",
    summary: "Verified parts of the soft-launch workspace.",
    icon: CheckCircle2,
    borderClass: "border-[#476553]",
    headingClass: "text-[#476553]",
    features: [
      { name: "FamilySearch capture import", status: "working", href: "/extension" },
      { name: "People, places, sources, and memories", status: "working", href: "/app/people" },
      { name: "Research operations and product Queue", status: "working", href: "/app/queue" },
      { name: "Private story drafting and review", status: "working", href: "/app/story-writer" },
    ],
  },
  {
    label: "Coming soon",
    summary: "Committed work required before a wider public launch.",
    icon: Clock3,
    borderClass: "border-[#9f5a2d]",
    headingClass: "text-[#9f5a2d]",
    features: [
      { name: "Story readiness and review flow", status: "in-progress" },
      { name: "Saved story outputs and share preview", status: "in-progress" },
      { name: "Cleaner person workspace paths", status: "in-progress" },
      { name: "Better research-gap explanations", status: "in-progress" },
    ],
  },
  {
    label: "Later",
    summary: "Useful directions that are not promises or launch claims.",
    icon: Search,
    borderClass: "border-[#234d5e]",
    headingClass: "text-[#234d5e]",
    features: [
      { name: "Photo and document analysis", status: "exploring" },
      { name: "Timeline builder", status: "exploring" },
      { name: "Place and era context researcher", status: "exploring" },
      { name: "Shareable ancestor story pages", status: "exploring" },
    ],
  },
];

const statusLabel: Record<StageStatus, string> = {
  working: "Works",
  "in-progress": "Coming soon",
  exploring: "Later",
};

const statusClass: Record<StageStatus, string> = {
  working: "border-[#476553] bg-[#476553] text-[#eef5f0]",
  "in-progress": "border-[#9f5a2d] bg-[#9f5a2d] text-[#fff5e8]",
  exploring: "border-[#234d5e] bg-[#234d5e] text-[#edf5f7]",
};

export function FeatureShowcase() {
  return (
    <section className="relative overflow-hidden bg-[#fffaf2] py-20 sm:py-24">
      <div className="absolute inset-x-0 top-0 h-px bg-[#b79f7a]" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl">
          <p className="text-xs uppercase tracking-[0.24em] text-[#5f665f]">Honest soft-launch status</p>
          <h2 className="mt-5 text-4xl leading-tight text-[#1d212a] sm:text-5xl" data-display="true">
            Current, coming soon, and later—kept deliberately separate.
          </h2>
          <p className="mt-5 max-w-3xl text-lg leading-relaxed text-[#4e5a64]">
            Active controls work today. Committed launch work is labeled Coming soon, while ideas
            that still need real use and product learning remain Later.
          </p>
        </div>

        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {journeyStages.map((stage) => (
            <div
              key={stage.label}
              className={`border-t-4 bg-[#f7f1e2] p-5 shadow-[0_26px_35px_-34px_#111] ${stage.borderClass}`}
            >
              <stage.icon className={`h-6 w-6 ${stage.headingClass}`} />
              <h3 className={`mt-4 text-3xl leading-tight ${stage.headingClass}`} data-display="true">
                {stage.label}
              </h3>
              <p className="mt-2 text-sm leading-6 text-[#4e5a64]">{stage.summary}</p>

              <ul className="mt-4 space-y-2">
                {stage.features.map((feature) => (
                  <li
                    key={feature.name}
                    className="border border-[#d7cfbf] bg-[#fffaf2cc] px-3 py-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      {feature.href ? (
                        <SafeLink
                          href={feature.href}
                          className="inline-flex items-center gap-1 text-sm font-medium text-[#234d5e] hover:text-[#1f4554]"
                        >
                          {feature.name}
                          <ArrowRight className="h-3.5 w-3.5" />
                        </SafeLink>
                      ) : (
                        <span className="text-sm font-medium text-[#24323e]">{feature.name}</span>
                      )}
                      <span
                        className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${statusClass[feature.status]}`}
                      >
                        {statusLabel[feature.status]}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 grid gap-5 border border-[#d7cfbf] bg-[#f6efe1] p-6 lg:grid-cols-[0.8fr_1.2fr] lg:p-8">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-[#6d6249]">The operating thesis</p>
            <p className="mt-4 text-3xl leading-tight text-[#1d212a]" data-display="true">
              A family tree shows connections. Family History preserves why they are believed.
            </p>
          </div>
          <p className="text-base leading-8 text-[#4e5a64]">
            Your AI can help gather and compare. The workspace keeps evidence, uncertainty,
            context, questions, and stories connected so a correction can travel through the
            trail without erasing how the earlier understanding was reached.
          </p>
        </div>
      </div>
    </section>
  );
}
