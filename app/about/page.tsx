/**
 * About Page
 * 
 * Purpose: Mission, story, and background of the project
 * 
 * Key Elements:
 * - Mission statement
 * - Philosophy section
 * - How it works
 * 
 * Dependencies:
 * - @/components/layout/MarketingNav
 * - @/components/layout/Footer
 * 
 * Last Updated: Initial setup
 */

import { MarketingNav } from "@/components/layout/MarketingNav";
import { Footer } from "@/components/layout/Footer";
import { Heart, Shield, Lightbulb, Users } from "lucide-react";
import type { Metadata } from "next";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "About",
  description:
    "Learn why Assist With Family History keeps evidence, uncertainty, relationships, research, and stories connected under your control.",
  path: "/about",
});

const principles = [
  {
    icon: Heart,
    title: "Evidence and story stay connected",
    description: "A meaningful story can remain readable while a curious person follows important details back to sources, context, uncertainty, and later corrections.",
  },
  {
    icon: Shield,
    title: "Your family history, your authority",
    description: "The private workspace is owner-scoped. Reading, changing, sharing, exporting, and publishing are separate operations rather than one blanket permission.",
  },
  {
    icon: Lightbulb,
    title: "Your AI remains your choice",
    description: "Your chosen AI can reason, compare, research, and draft. Family History keeps the durable records and enforces its own data and tool boundary.",
  },
  {
    icon: Users,
    title: "Uncertainty belongs in the record",
    description: "Candidate identities, conflicting evidence, family lore, inference, and historical context remain visible instead of being flattened into one official answer.",
  },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white">
      <MarketingNav />
      <main className="pt-24 pb-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="text-center mb-16">
            <h1 className="text-4xl sm:text-5xl font-bold text-stone-900 mb-6">
              About Assist With Family History
            </h1>
            <p className="text-xl text-stone-500">
              A different approach to family history tools
            </p>
          </div>

          {/* Mission */}
          <section className="mb-16">
            <h2 className="text-2xl font-bold text-stone-900 mb-4">Our Mission</h2>
            <div className="prose prose-stone prose-lg max-w-none">
              <p className="text-stone-600 leading-relaxed">
                Traditional genealogy software focuses on building trees—collecting names, 
                dates, and connecting relationships. That&apos;s important work, but it&apos;s only 
                the beginning.
              </p>
              <p className="text-stone-600 leading-relaxed">
                <strong>Assist With Family History</strong> preserves the trail behind the tree. It
                connects people and relationships with events, places, sources, questions,
                interpretations, and stories so useful work can survive the current conversation.
              </p>
              <p className="text-stone-600 leading-relaxed">
                Your chosen AI can help gather, compare, and draft under your direction. The
                workspace keeps what came from a source distinct from what was inferred, disputed,
                remembered, or added as wider historical context—and lets you correct the result.
              </p>
            </div>
          </section>

          {/* Principles */}
          <section className="mb-16">
            <h2 className="text-2xl font-bold text-stone-900 mb-8">Our Principles</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {principles.map((principle) => (
                <div key={principle.title} className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                      <principle.icon className="w-5 h-5 text-amber-700" />
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold text-stone-900 mb-1">
                      {principle.title}
                    </h3>
                    <p className="text-stone-500 text-sm leading-relaxed">
                      {principle.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* How It Works */}
          <section className="mb-16">
            <h2 className="text-2xl font-bold text-stone-900 mb-4">How It Works</h2>
            <div className="bg-stone-50 rounded-2xl p-8">
              <ol className="space-y-6">
                <li className="flex gap-4">
                  <span className="flex-shrink-0 w-8 h-8 bg-amber-700 text-white rounded-full flex items-center justify-center font-bold">
                    1
                  </span>
                  <div>
                    <h3 className="font-semibold text-stone-900">Extract</h3>
                    <p className="text-stone-500">
                      Begin with a person and known relationship, or preserve the source, memory,
                      place, event, or question that brought you here.
                    </p>
                  </div>
                </li>
                <li className="flex gap-4">
                  <span className="flex-shrink-0 w-8 h-8 bg-amber-700 text-white rounded-full flex items-center justify-center font-bold">
                    2
                  </span>
                  <div>
                    <h3 className="font-semibold text-stone-900">Document</h3>
                    <p className="text-stone-500">
                      Keep original material, citations, extracts, confidence, conflicts, and
                      capture provenance connected to every relevant person and event.
                    </p>
                  </div>
                </li>
                <li className="flex gap-4">
                  <span className="flex-shrink-0 w-8 h-8 bg-amber-700 text-white rounded-full flex items-center justify-center font-bold">
                    3
                  </span>
                  <div>
                    <h3 className="font-semibold text-stone-900">Contextualize</h3>
                    <p className="text-stone-500">
                      Compare evidence and context without silently turning a proposal into a fact.
                      Unresolved gaps become durable research work rather than lost chat history.
                    </p>
                  </div>
                </li>
                <li className="flex gap-4">
                  <span className="flex-shrink-0 w-8 h-8 bg-amber-700 text-white rounded-full flex items-center justify-center font-bold">
                    4
                  </span>
                  <div>
                    <h3 className="font-semibold text-stone-900">Tell</h3>
                    <p className="text-stone-500">
                      Build a private, source-aware story, follow details back to their evidence,
                      and keep publication as a separate human-reviewed decision.
                    </p>
                  </div>
                </li>
              </ol>
            </div>
          </section>

          {/* Open Source Note */}
          <section className="text-center">
            <p className="text-stone-500">
              Assist your AI, so it can assist you with family history.
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
