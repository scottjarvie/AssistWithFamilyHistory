/**
 * Homepage - Discover Their Stories
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
import type { Metadata } from "next";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Home",
  description:
    "A private beta workspace for AI-assisted genealogy research, operating data, and ancestor story drafting.",
  path: "/",
});

export default function HomePage() {
  return (
    <div className="min-h-screen text-[#1d212a]">
      <MarketingNav />
      <main className="overflow-x-hidden">
        <Hero />
        <FeatureShowcase />
        <CTASection />
      </main>
      <Footer />
    </div>
  );
}
