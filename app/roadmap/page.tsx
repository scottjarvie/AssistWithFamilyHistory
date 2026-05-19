import type { Metadata } from "next";
import { ArrowRight, CheckCircle2, Clock3, FlaskConical } from "lucide-react";
import { MarketingNav } from "@/components/layout/MarketingNav";
import { Footer } from "@/components/layout/Footer";
import { Badge } from "@/components/ui/badge";
import { createPageMetadata } from "@/lib/seo";

const roadmap = [
  {
    phase: "Working Now",
    icon: CheckCircle2,
    copy: "Enough is in place for real beta work: capture, merge, browse, inspect, draft, review, and publish intentionally.",
    items: [
      "Vault-backed people, places, events, sources, memories, documents, stories, and research tasks",
      "Person context packs for AI-assisted writing and planning",
      "Operations queue based on current research checks",
      "Saved story drafts and private review workflow",
    ],
  },
  {
    phase: "Being Worked On",
    icon: Clock3,
    copy: "The next layer is making the app feel like a story workshop instead of just a data store.",
    items: [
      "Story-first dashboard and person overview hierarchy",
      "Story Studio review pages with explicit publish and unpublish actions",
      "Public story pages at /stories/[id] with evidence and context",
      "Clear beta-facing copy across homepage, features, and roadmap",
    ],
  },
  {
    phase: "Being Explored",
    icon: FlaskConical,
    copy: "These are likely side tools, but they need to serve the main goal: better researched ancestor stories.",
    items: [
      "Photo, handwriting, and document transcription workflows",
      "Locality, church, era, migration, newspaper, and historical context builders",
      "Richer story publishing controls, prettier slugs, and collaborative review",
      "Book, exhibit, and family-sharing surfaces built from the same evidence graph",
    ],
  },
];

export const metadata: Metadata = createPageMetadata({
  title: "Roadmap",
  description:
    "A transparent beta roadmap for Discover Their Stories: what works now, what is being built, and what is being explored.",
  path: "/roadmap",
});

export default function RoadmapPage() {
  return (
    <div className="min-h-screen bg-[#f8f4ec]">
      <MarketingNav />
      <main className="pt-24">
        <section className="border-b border-[#d8c7a7] bg-[#1f2f35] px-4 py-12 text-white sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl">
            <Badge className="mb-5 bg-white/10 text-white hover:bg-white/10">
              Honest beta roadmap
            </Badge>
            <h1 className="max-w-4xl font-[family-name:var(--font-cormorant-garamond)] text-5xl font-semibold leading-[0.95] sm:text-6xl">
              Build toward stories, without pretending everything is finished.
            </h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-[#d9cdb5]">
              The goal is a research workspace that gathers enough data, context, and evidence to tell richer stories about ancestors, places, communities, and eras.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="space-y-5">
            {roadmap.map((phase, index) => (
              <section key={phase.phase} className="grid gap-5 border border-[#d8c7a7] bg-white px-5 py-6 shadow-sm md:grid-cols-[240px_1fr]">
                <div>
                  <phase.icon className="h-6 w-6 text-[#9f5a2d]" />
                  <h2 className="mt-3 text-2xl font-semibold text-[#1d212a]">{phase.phase}</h2>
                  <p className="mt-3 text-sm leading-6 text-[#625947]">{phase.copy}</p>
                </div>
                <div className="space-y-3">
                  {phase.items.map((item) => (
                    <div key={item} className="flex gap-3 border border-[#e6dcc8] px-4 py-3">
                      <span className="mt-1 text-xs font-semibold text-[#9f5a2d]">{index + 1}</span>
                      <p className="text-sm leading-6 text-[#3f392d]">{item}</p>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </section>

        <section className="border-t border-[#d8c7a7] bg-white px-4 py-10 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-5xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-[#1d212a]">Near-term priority</h2>
              <p className="mt-2 text-sm leading-6 text-[#625947]">
                Make the private app excellent at research readiness and make public stories clear, grounded, and beautiful.
              </p>
            </div>
            <a href="/app" className="inline-flex items-center gap-2 text-sm font-semibold text-[#7c4425]">
              Enter the studio
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
