import Link from "next/link";
import { ArrowRight } from "lucide-react";

type StageStatus = "available" | "coming-soon" | "planned";

interface StageFeature {
  name: string;
  status: StageStatus;
  href?: string;
}

interface JourneyStage {
  name: string;
  blurb: string;
  pillClass: string;
  accentClass: string;
  cardClass: string;
  features: StageFeature[];
}

const journeyStages: JourneyStage[] = [
  {
    name: "Discover",
    blurb: "Collect the clues.",
    pillClass: "bg-[#234d5e]",
    accentClass: "text-[#234d5e]",
    cardClass: "border-[#234d5e55]",
    features: [
      { name: "Research Vault Intake", status: "available", href: "/features/source-docs" },
      { name: "Photo Analyzer", status: "planned" },
    ],
  },
  {
    name: "Contextualize",
    blurb: "Organize meaning.",
    pillClass: "bg-[#9f5a2d]",
    accentClass: "text-[#9f5a2d]",
    cardClass: "border-[#9f5a2d55]",
    features: [
      { name: "Context Packs & Dossiers", status: "available", href: "/features/source-docs" },
      { name: "Timeline Builder", status: "planned" },
    ],
  },
  {
    name: "Research",
    blurb: "Resolve evidence.",
    pillClass: "bg-[#42566b]",
    accentClass: "text-[#42566b]",
    cardClass: "border-[#42566b55]",
    features: [
      { name: "Research Planner", status: "planned" },
      { name: "Document Transcriber", status: "planned" },
    ],
  },
  {
    name: "Craft Stories",
    blurb: "Write with voice.",
    pillClass: "bg-[#476553]",
    accentClass: "text-[#476553]",
    cardClass: "border-[#47655355]",
    features: [
      { name: "Story Writer", status: "available", href: "/app/story-writer" },
      { name: "Narrative Composer", status: "planned" },
    ],
  },
  {
    name: "Preserve",
    blurb: "Pass stories on.",
    pillClass: "bg-[#35506a]",
    accentClass: "text-[#35506a]",
    cardClass: "border-[#35506a55]",
    features: [
      { name: "Family Group Sheets", status: "planned" },
      { name: "Export Archive", status: "available", href: "/app" },
    ],
  },
];

const statusLabel: Record<StageStatus, string> = {
  available: "Available",
  "coming-soon": "Soon",
  planned: "Planned",
};

const statusClass: Record<StageStatus, string> = {
  available: "border-[#2f6a69] bg-[#2f6a69] text-[#eef5f3]",
  "coming-soon": "border-[#8a6b2f] bg-[#8a6b2f] text-[#f7edd4]",
  planned: "border-[#c0c3b5] bg-[#e7e3d5] text-[#5f665f]",
};

export function FeatureShowcase() {
  return (
    <section className="relative overflow-hidden py-24 sm:py-28">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,#ffffff8a_0%,transparent_50%),radial-gradient(circle_at_85%_0%,#d7c6a966_0%,transparent_45%)]" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-xs uppercase tracking-[0.24em] text-[#5f665f]">One Clear Journey</p>
          <h2 className="mt-5 text-4xl leading-tight text-[#1d212a] sm:text-5xl" data-display="true">
            The Five Stations
          </h2>
          <p className="mx-auto mt-5 max-w-3xl text-lg leading-relaxed text-[#4e5a64]">
            AI supports every stage and helps weave stories from the context of real lives.
          </p>
        </div>

        <div className="mt-10 overflow-x-auto pb-2">
          <div className="mx-auto flex min-w-max items-center gap-3 rounded-2xl border border-[#b79f7a66] bg-[#efe4cdcc] px-6 py-5 shadow-[0_24px_35px_-34px_#111]">
            {journeyStages.map((stage, index) => (
              <div key={stage.name} className="flex items-center gap-3">
                <span
                  className={`rounded-full px-6 py-2.5 text-sm font-semibold uppercase tracking-[0.14em] text-[#f7f3e8] ${stage.pillClass}`}
                >
                  {stage.name}
                </span>
                {index < journeyStages.length - 1 && <span className="text-xl text-[#6d6249]">→</span>}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-5">
          {journeyStages.map((stage, index) => (
            <div
              key={stage.name}
              className={`rounded-2xl border bg-[#fdf9f0cc] p-5 shadow-[0_26px_35px_-34px_#111] ${stage.cardClass}`}
            >
              <p className="text-[11px] uppercase tracking-[0.22em] text-[#6d6249]">Station {index + 1}</p>
              <h3 className={`mt-2 text-3xl leading-tight ${stage.accentClass}`} data-display="true">
                {stage.name}
              </h3>
              <p className="mt-1 text-sm text-[#4e5a64]">{stage.blurb}</p>

              <ul className="mt-4 space-y-2">
                {stage.features.map((feature) => (
                  <li
                    key={feature.name}
                    className="rounded-xl border border-[#d7cfbf] bg-[#fffaf2cc] px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      {feature.href ? (
                        <Link
                          href={feature.href}
                          className="inline-flex items-center gap-1 text-sm font-medium text-[#234d5e] hover:text-[#1f4554]"
                        >
                          {feature.name}
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      ) : (
                        <span className="text-sm font-medium text-[#24323e]">{feature.name}</span>
                      )}
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${statusClass[feature.status]}`}
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
      </div>
    </section>
  );
}
