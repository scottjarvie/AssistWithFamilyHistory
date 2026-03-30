/**
 * Roadmap Page
 * 
 * Purpose: Show upcoming features and development transparency
 * 
 * Key Elements:
 * - Current features
 * - In development features
 * - Planned features
 * - Feature request CTA
 * 
 * Dependencies:
 * - @/components/layout/MarketingNav
 * - @/components/layout/Footer
 * 
 * Last Updated: Initial setup
 */

import { MarketingNav } from "@/components/layout/MarketingNav";
import { Footer } from "@/components/layout/Footer";
import { CheckCircle, Clock, Lightbulb } from "lucide-react";
import type { Metadata } from "next";
import { createPageMetadata } from "@/lib/seo";

const roadmapItems = [
  {
    phase: "Available Now",
    icon: CheckCircle,
    iconColor: "text-green-600",
    bgColor: "bg-green-50",
    items: [
      {
        title: "Research Vault Workflow",
        description: "Capture FamilySearch sources and memories, merge them into the vault, and generate raw documents, dossiers, and context packs.",
      },
      {
        title: "Browser Extension",
        description: "Chrome extension for capturing FamilySearch sources and memories pages.",
      },
      {
        title: "Convex-Backed Graph",
        description: "Canonical structured genealogy data stored in Convex with raw artifacts and exports kept locally.",
      },
      {
        title: "Export/Import Workflow",
        description: "Use any AI model via export prompts and import results.",
      },
      {
        title: "Story Writer v1",
        description: "Generate short stories, longer narrative drafts, and research-gap notes from a person context pack.",
      },
    ],
  },
  {
    phase: "In Development",
    icon: Clock,
    iconColor: "text-amber-600",
    bgColor: "bg-amber-50",
    items: [
      {
        title: "FamilySearch API Integration",
        description: "Direct API access for faster and more reliable data extraction.",
      },
    ],
  },
  {
    phase: "Planned",
    icon: Lightbulb,
    iconColor: "text-stone-400",
    bgColor: "bg-stone-50",
    items: [
      {
        title: "Photo Analyzer",
        description: "AI vision for extracting information from old photographs.",
      },
      {
        title: "Timeline Builder",
        description: "Visual timelines from multiple sources.",
      },
      {
        title: "Research Planner",
        description: "Track research goals with AI-suggested next steps.",
      },
      {
        title: "Document Transcriber",
        description: "OCR and AI transcription for handwritten documents.",
      },
      {
        title: "Family Group Sheets",
        description: "Generate formatted family group sheets from documented data.",
      },
      {
        title: "Multi-Source Support",
        description: "Support for Ancestry, FindMyPast, and other genealogy platforms.",
      },
    ],
  },
];

export const metadata: Metadata = createPageMetadata({
  title: "Roadmap",
  description:
    "See what is available now, in development, and planned for Discover Their Stories.",
  path: "/roadmap",
});

export default function RoadmapPage() {
  return (
    <div className="min-h-screen bg-white">
      <MarketingNav />
      <main className="pt-24 pb-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="text-center mb-16">
            <h1 className="text-4xl sm:text-5xl font-bold text-stone-900 mb-6">
              Roadmap
            </h1>
            <p className="text-xl text-stone-500 max-w-2xl mx-auto">
              Transparency about what we&apos;re building. Features move through 
              phases as development progresses.
            </p>
          </div>

          {/* Roadmap Phases */}
          <div className="space-y-12">
            {roadmapItems.map((phase) => (
              <section key={phase.phase}>
                <div className="flex items-center gap-3 mb-6">
                  <div className={`w-10 h-10 rounded-lg ${phase.bgColor} flex items-center justify-center`}>
                    <phase.icon className={`w-5 h-5 ${phase.iconColor}`} />
                  </div>
                  <h2 className="text-2xl font-bold text-stone-900">
                    {phase.phase}
                  </h2>
                </div>
                <div className="space-y-4 pl-13">
                  {phase.items.map((item) => (
                    <div 
                      key={item.title} 
                      className={`${phase.bgColor} rounded-xl p-6 ml-13`}
                    >
                      <h3 className="font-semibold text-stone-900 mb-1">
                        {item.title}
                      </h3>
                      <p className="text-stone-500 text-sm">
                        {item.description}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>

          {/* Feature Request */}
          <div className="mt-16 text-center bg-stone-50 rounded-2xl p-8">
            <h3 className="text-xl font-bold text-stone-900 mb-2">
              Have a feature idea?
            </h3>
            <p className="text-stone-500 mb-4">
              We&apos;d love to hear what would help your family history research.
            </p>
            <a 
              href="mailto:features@discovertheirstories.com"
              className="inline-flex items-center gap-2 text-amber-700 font-medium hover:underline"
            >
              Send us your ideas
            </a>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
