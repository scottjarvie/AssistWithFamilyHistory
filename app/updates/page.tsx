import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { Footer } from "@/components/layout/Footer";
import { MarketingNav } from "@/components/layout/MarketingNav";
import { ReleaseLog } from "@/components/updates/ReleaseLog";
import { Badge } from "@/components/ui/badge";
import { releaseNotes } from "@/lib/releaseNotes";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "What's New",
  description: "Created, fixed, and upgraded changes in Discover Their Stories.",
  path: "/updates",
});

export default function UpdatesPage() {
  const latest = releaseNotes[0];
  return (
    <div className="min-h-screen bg-[#f8f4ec]">
      <MarketingNav />
      <main className="pt-24">
        <section className="border-b border-[#d8c7a7] bg-[#1f2f35] px-4 py-12 text-white sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl">
            <Badge className="mb-5 bg-white/10 text-white hover:bg-white/10">Product updates</Badge>
            <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-5xl font-semibold leading-[0.95] sm:text-6xl">What&apos;s New</h1>
            <p className="mt-5 text-sm font-medium text-[#d9cdb5]">Latest record · v{latest.version} · {latest.status}</p>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-[#d9cdb5]">A public, privacy-safe explanation of what changed, why it matters, and where to find it.</p>
          </div>
        </section>
        <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="mb-6 flex items-start gap-3 border border-[#d8c7a7] bg-white px-5 py-4 text-sm leading-6 text-[#625947]">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#234d5e]" aria-hidden="true" />
            <p>This page is public and static. It never reads vault data, imported records, memories, notes, or private research artifacts.</p>
          </div>
          <ReleaseLog entries={releaseNotes} />
        </section>
      </main>
      <Footer />
    </div>
  );
}
