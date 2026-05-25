/**
 * Source Docs Feature Page
 * 
 * Purpose: Deep dive on the vault's source documentation workflow
 * 
 * Key Elements:
 * - Feature overview
 * - How it works
 * - Output examples
 * - CTA to try the tool
 * 
 * Dependencies:
 * - @/components/layout/MarketingNav
 * - @/components/layout/Footer
 * - @/components/ui/button
 * 
 * Last Updated: Initial setup
 */

import { MarketingNav } from "@/components/layout/MarketingNav";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { SafeLink as Link } from "@/components/layout/SafeLink";
import { ArrowRight, FileText, Brain, Download, CheckCircle } from "lucide-react";
import type { Metadata } from "next";
import { createPageMetadata } from "@/lib/seo";

const steps = [
  {
    step: 1,
    title: "Install the Extension",
    description: "Add our Chrome extension to your browser. It activates when you visit FamilySearch person pages.",
  },
  {
    step: 2,
    title: "Capture FamilySearch Data",
    description: "Use the extension to capture sources or memories for a person, including indexed information, citations, relationships, and place mentions.",
  },
  {
    step: 3,
    title: "Import to App",
    description: "Import the capture package into the Research Vault so people, places, documents, and research history update together.",
  },
  {
    step: 4,
    title: "Generate Raw Document",
    description: "The app creates a clean, deterministic evidence document with all source information organized and anchored.",
  },
  {
    step: 5,
    title: "AI Contextualization",
    description: "Use AI to analyze sources, find patterns, identify conflicts, group duplicates, and create a research-ready dossier.",
  },
];

const outputs = [
  {
    icon: FileText,
    title: "Raw Evidence Document",
    description: "A complete, lossless capture of all source data. Deterministic (no AI), organized with source anchors (S1, S2, etc.), and perfect for archival purposes.",
  },
  {
    icon: Brain,
    title: "Contextualized Dossier",
    description: "AI-generated analysis that synthesizes sources, identifies verified facts with confidence levels, finds conflicts, builds timelines, and suggests research directions.",
  },
];

export const metadata: Metadata = createPageMetadata({
  title: "Source Documentation In The Research Vault",
  description:
    "Learn how the Research Vault captures FamilySearch records and turns them into raw evidence documents, dossiers, and AI-ready context packs.",
  path: "/features/source-docs",
});

export default function SourceDocsFeaturePage() {
  return (
    <div className="min-h-screen bg-white">
      <MarketingNav />
      <main className="pt-24 pb-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="text-center mb-16">
            <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <FileText className="w-8 h-8 text-amber-700" />
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold text-stone-900 mb-6">
              Source Documentation In The Research Vault
            </h1>
            <p className="text-xl text-stone-500 max-w-2xl mx-auto">
              Capture FamilySearch evidence, merge it into a canonical research graph, and generate raw documents, dossiers, and context packs from one person workspace.
            </p>
            <p className="mt-4 text-sm text-stone-500">
              <Link href="/features" className="text-amber-700 hover:underline">
                Browse all features
              </Link>
              {" · "}
              <Link href="/extension" className="text-amber-700 hover:underline">
                Install the browser extension
              </Link>
            </p>
          </div>

          {/* Key Benefits */}
          <section className="mb-16">
            <h2 className="sr-only">Key Benefits</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center p-6">
                <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-3" />
                <h3 className="font-semibold text-stone-900 mb-2">Capture Everything</h3>
                <p className="text-stone-500 text-sm">
                  All indexed information, citations, tags, and attachments in one place.
                </p>
              </div>
              <div className="text-center p-6">
                <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-3" />
                <h3 className="font-semibold text-stone-900 mb-2">Find Patterns</h3>
                <p className="text-stone-500 text-sm">
                  AI identifies duplicates, conflicts, and connections across sources.
                </p>
              </div>
              <div className="text-center p-6">
                <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-3" />
                <h3 className="font-semibold text-stone-900 mb-2">Export Everything</h3>
                <p className="text-stone-500 text-sm">
                  All outputs in Markdown. Use them anywhere, share with anyone.
                </p>
              </div>
            </div>
          </section>

          {/* How It Works */}
          <section className="mb-16">
            <h2 className="text-2xl font-bold text-stone-900 mb-8 text-center">
              How It Works
            </h2>
            <div className="space-y-6">
              {steps.map((step) => (
                <div key={step.step} className="flex gap-4">
                  <span className="flex-shrink-0 w-8 h-8 bg-amber-700 text-white rounded-full flex items-center justify-center font-bold text-sm">
                    {step.step}
                  </span>
                  <div>
                    <h3 className="font-semibold text-stone-900">{step.title}</h3>
                    <p className="text-stone-500">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Outputs */}
          <section className="mb-16">
            <h2 className="text-2xl font-bold text-stone-900 mb-8 text-center">
              What You Get
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {outputs.map((output) => (
                <div key={output.title} className="bg-stone-50 rounded-2xl p-6">
                  <output.icon className="w-8 h-8 text-amber-700 mb-4" />
                  <h3 className="font-semibold text-stone-900 mb-2">
                    {output.title}
                  </h3>
                  <p className="text-stone-500 text-sm leading-relaxed">
                    {output.description}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* AI Options */}
          <section className="mb-16">
            <h2 className="text-2xl font-bold text-stone-900 mb-6 text-center">
              Flexible AI Processing
            </h2>
            <div className="bg-amber-50 rounded-2xl p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <h3 className="font-semibold text-stone-900 mb-2 flex items-center gap-2">
                    <Download className="w-5 h-5 text-amber-700" />
                    In-App Processing
                  </h3>
                  <p className="text-stone-600 text-sm">
                    Connect your OpenRouter API key and process directly in the app. 
                    Choose from Claude, GPT-4, Gemini, and more.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-stone-900 mb-2 flex items-center gap-2">
                    <Download className="w-5 h-5 text-amber-700" />
                    Export/Import Workflow
                  </h3>
                  <p className="text-stone-600 text-sm">
                    Export prompts and data, use any AI tool you prefer, then import 
                    the results. Perfect for complex research or premium models.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* CTA */}
          <div className="text-center">
            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="bg-amber-700 hover:bg-amber-800 text-lg px-8 py-6"
              >
                <Link href="/app/imports" className="flex items-center gap-2">
                  Open Imports Workspace
                  <ArrowRight className="w-5 h-5" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="text-lg px-8 py-6">
                <Link href="/extension">Install Extension</Link>
              </Button>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
