/**
 * Features Page
 * 
 * Purpose: Overview of all tools with detailed descriptions
 * 
 * Key Elements:
 * - Page header
 * - Detailed feature descriptions
 * - Status indicators
 * 
 * Dependencies:
 * - @/components/layout/MarketingNav
 * - @/components/layout/Footer
 * - @/components/layout/FeatureCard
 * 
 * Last Updated: Initial setup
 */

import { MarketingNav } from "@/components/layout/MarketingNav";
import { Footer } from "@/components/layout/Footer";
import { FeatureCard } from "@/components/layout/FeatureCard";
import type { Metadata } from "next";
import { createPageMetadata } from "@/lib/seo";
import { 
  FileText, 
  BookOpen, 
  Image, 
  Clock, 
  Target, 
  FileSearch,
  Users
} from "lucide-react";

const features = [
  {
    title: "Research Vault Intake",
    description: "Capture FamilySearch sources and memories, merge them into a canonical person-and-place graph, and generate raw documents, contextualized dossiers, and context packs from one workspace.",
    icon: FileText,
    status: "available" as const,
    href: "/features/source-docs",
  },
  {
    title: "Story Writer",
    description: "Transform a person context pack into short stories, longer narrative drafts, and research-gap notes, then save those drafts back into the vault.",
    icon: BookOpen,
    status: "available" as const,
    href: "/app/story-writer",
  },
  {
    title: "Photo Analyzer",
    description: "Upload old family photographs and use AI vision to extract information. Identify approximate dates from clothing and settings, detect faces for identification, and add context about locations and events captured in the images.",
    icon: Image,
    status: "planned" as const,
  },
  {
    title: "Timeline Builder",
    description: "Create visual timelines from your documented sources. See your ancestor's life events plotted chronologically, identify gaps in the record, and understand how their life intersected with historical events.",
    icon: Clock,
    status: "planned" as const,
  },
  {
    title: "Research Planner",
    description: "Keep track of your research goals and get AI-suggested next steps. The planner learns from your documented sources and suggests records you might not have considered, helping you break through brick walls.",
    icon: Target,
    status: "planned" as const,
  },
  {
    title: "Document Transcriber",
    description: "Upload images of handwritten documents—old letters, diaries, or records—and get AI-powered transcriptions. The tool handles cursive handwriting and provides both literal transcriptions and normalized versions.",
    icon: FileSearch,
    status: "planned" as const,
  },
  {
    title: "Family Group Sheets",
    description: "Generate beautifully formatted family group sheets from your documented data. Export to PDF or print-ready formats that are perfect for sharing with family or submitting to genealogical societies.",
    icon: Users,
    status: "planned" as const,
  },
];

export const metadata: Metadata = createPageMetadata({
  title: "Features",
  description:
    "Explore the tools in Discover Their Stories, including the Research Vault workflow and planned family history storytelling tools.",
  path: "/features",
});

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-stone-50">
      <MarketingNav />
      <main className="pt-24 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="text-center mb-16">
            <h1 className="text-4xl sm:text-5xl font-bold text-stone-900 mb-6">
              Features
            </h1>
            <p className="text-xl text-stone-500 max-w-3xl mx-auto">
              Purpose-built tools for family historians who want to go beyond 
              collecting names and dates. Each tool is designed to help you 
              research, document, and tell the stories of your ancestors.
            </p>
          </div>

          {/* Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <FeatureCard key={feature.title} {...feature} />
            ))}
          </div>

          {/* Coming Soon Note */}
          <div className="mt-16 text-center">
            <p className="text-stone-500">
              Have a feature request?{" "}
              <a href="mailto:features@discovertheirstories.com" className="text-amber-700 hover:underline">
                Let us know
              </a>
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
