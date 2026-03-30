import type { Metadata } from "next";
import { MarketingNav } from "@/components/layout/MarketingNav";
import { Footer } from "@/components/layout/Footer";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Privacy Policy",
  description:
    "Privacy policy for Discover Their Stories, including local storage behavior and AI processing controls.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white">
      <MarketingNav />
      <main className="pt-24 pb-16">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <h1 className="mb-4 text-4xl font-bold text-stone-900">Privacy Policy</h1>
          <p className="mb-10 text-stone-500">Last updated: February 23, 2026</p>

          <section className="mb-8 space-y-3">
            <h2 className="text-2xl font-semibold text-stone-900">Data Storage</h2>
            <p className="text-stone-600">
              Discover Their Stories stores structured genealogy data in Convex when the vault backend is configured.
              Raw capture packages, legacy source-document artifacts, and generated markdown exports are also stored locally under `data/source-docs/` for artifact retention and export.
            </p>
          </section>

          <section className="mb-8 space-y-3">
            <h2 className="text-2xl font-semibold text-stone-900">AI Processing</h2>
            <p className="text-stone-600">
              AI processing only occurs when you explicitly trigger it. Requests are sent using the OpenRouter API key
              you provide in settings. You can choose redacted or original data before each processing run.
            </p>
          </section>

          <section className="mb-8 space-y-3">
            <h2 className="text-2xl font-semibold text-stone-900">Sensitive Information</h2>
            <p className="text-stone-600">
              The app includes redaction controls for common sensitive values such as emails, phone numbers, and SSNs.
              You are responsible for reviewing your data before sharing or exporting.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold text-stone-900">Contact</h2>
            <p className="text-stone-600">
              Questions about this policy can be sent to{" "}
              <a className="text-amber-700 hover:underline" href="mailto:privacy@discovertheirstories.com">
                privacy@discovertheirstories.com
              </a>
              .
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
