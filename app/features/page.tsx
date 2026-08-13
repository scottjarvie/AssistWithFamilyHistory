import type { Metadata } from "next";
import { BookOpen, CheckCircle2, Clock3, FlaskConical } from "lucide-react";
import { MarketingNav } from "@/components/layout/MarketingNav";
import { Footer } from "@/components/layout/Footer";
import { Badge } from "@/components/ui/badge";
import { createPageMetadata } from "@/lib/seo";

const statusGroups = [
  {
    title: "Current",
    icon: CheckCircle2,
    tone: "text-[#4f765d]",
    items: [
      "FamilySearch capture intake and vault merge workflow",
      "People, places, events, sources, memories, documents, and research log views",
      "Research readiness checks for biography, timeline, relationships, key records, memories, and place context",
      "Context-pack driven Story Writer for draft narratives and research-gap notes",
      "Story Studio for reviewing saved drafts and explicitly publishing story pages",
    ],
  },
  {
    title: "Coming Soon",
    icon: Clock3,
    tone: "text-[#9f5a2d]",
    items: [
      "A stronger person overview that starts with story readiness but keeps dense operating data close",
      "Published story pages that show narrative first, then evidence, places, events, and memories",
      "Clearer research queue labels for what blocks drafting versus publishing",
      "More useful beta homepage, features, and roadmap language for testers",
    ],
  },
  {
    title: "Later",
    icon: FlaskConical,
    tone: "text-[#5b6d7a]",
    items: [
      "Photo and document analysis for old family media",
      "Timeline and locality context tools that connect people to towns, churches, eras, and news",
      "Better public story URLs and richer sharing controls",
      "AI side tools for transcription, source comparison, research planning, and book assembly",
    ],
  },
];

export const metadata: Metadata = createPageMetadata({
  title: "Features",
  description:
    "See what is working now, being worked on, and being explored in Assist With Family History.",
  path: "/features",
});

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-[#f8f4ec]">
      <MarketingNav />
      <main className="pt-24">
        <section className="border-b border-[#d8c7a7] bg-[#efe4cd] px-4 py-12 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <Badge className="mb-5 border-[#9f5a2d33] bg-white/60 text-[#7c4425] hover:bg-white/60">
              Soft-launch capability map
            </Badge>
            <h1 className="max-w-4xl font-[family-name:var(--font-cormorant-garamond)] text-5xl font-semibold leading-[0.95] text-[#1d212a] sm:text-6xl">
              Tools for turning research into ancestor stories.
            </h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-[#5f5542]">
              This is a durable research-to-story workspace in soft launch. It is a working beta for collecting the evidence, context, relationships, places, and memories needed to speak for ancestors with care.
            </p>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-5 px-4 py-10 sm:px-6 lg:grid-cols-3 lg:px-8">
          {statusGroups.map((group) => (
            <div key={group.title} className="border border-[#d8c7a7] bg-white px-5 py-6 shadow-sm">
              <div className="flex items-center gap-3">
                <group.icon className={`h-5 w-5 ${group.tone}`} />
                <h2 className="text-xl font-semibold text-[#1d212a]">{group.title}</h2>
              </div>
              <ul className="mt-5 space-y-4">
                {group.items.map((item) => (
                  <li key={item} className="border-l-2 border-[#c57d39] pl-3 text-sm leading-6 text-[#5f5542]">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <section className="border-y border-[#d8c7a7] bg-white px-4 py-10 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.85fr_1.15fr]">
            <div className="flex items-start gap-3">
              <BookOpen className="mt-1 h-6 w-6 text-[#9f5a2d]" />
              <div>
                <h2 className="text-2xl font-semibold text-[#1d212a]">The product arc</h2>
                <p className="mt-3 text-sm leading-7 text-[#625947]">
                  Collect operating data, understand context, identify research gaps, write drafts, review the grounding, then publish intentionally.
                </p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              {["Intake", "Vault", "Research", "Stories"].map((step) => (
                <div key={step} className="border border-[#e6dcc8] px-4 py-4 text-center text-sm font-medium text-[#2d2b26]">
                  {step}
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
