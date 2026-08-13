/**
 * Homepage - Assist With Family History
 * 
 * Purpose: Marketing landing page for the platform
 * 
 * Key Elements:
 * - Navigation bar
 * - Hero section with headline and CTAs
 * - Feature showcase
 * - CTA section
 * - Footer
 * 
 * Dependencies:
 * - @/components/layout/MarketingNav
 * - @/components/layout/Footer
 * - @/components/marketing/Hero
 * - @/components/marketing/FeatureShowcase
 * - @/components/marketing/CTASection
 * 
 * Last Updated: Initial setup
 */

import { MarketingNav } from "@/components/layout/MarketingNav";
import { Footer } from "@/components/layout/Footer";
import { Hero } from "@/components/marketing/Hero";
import { FeatureShowcase } from "@/components/marketing/FeatureShowcase";
import { CTASection } from "@/components/marketing/CTASection";
import { FamilyHistoryFaq } from "@/components/marketing/FamilyHistoryFaq";
import type { Metadata } from "next";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Home",
  description:
    "A durable, user-controlled family-history research-to-story workspace for connected evidence, context, corrections, and meaningful stories.",
  path: "/",
});

export default function HomePage() {
  return (
    <div className="min-h-screen text-[#1d212a]">
      <MarketingNav />
      <main className="overflow-x-hidden">
        <Hero />
        <FeatureShowcase />
        <FamilyHistoryFaq />
        <CTASection />
      </main>
      <Footer />
    </div>
  );
}
