import type { Metadata } from "next";
import { MarketingNav } from "@/components/layout/MarketingNav";
import { Footer } from "@/components/layout/Footer";
import { SafeAnchor } from "@/components/layout/SafeLink";
import { createPageMetadata } from "@/lib/seo";
import {
  NO_DIRECT_EMAIL_STATEMENT,
  SUPPORT_DESK_LABEL,
  SUPPORT_DESK_URL,
} from "@/lib/site/supportDesk";

export const metadata: Metadata = createPageMetadata({
  title: "Privacy Policy",
  description:
    "Privacy policy for Assist With Family History, including local storage behavior and AI processing controls.",
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
              Assist With Family History stores structured genealogy data in Convex when the vault backend is configured.
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
              Bring questions about this policy to{" "}
              <SafeAnchor
                className="text-amber-700 hover:underline"
                href={SUPPORT_DESK_URL}
                rel="noreferrer"
                target="_blank"
              >
                {SUPPORT_DESK_LABEL}
              </SafeAnchor>
              , the one support desk for every Assist With site.{" "}
              {NO_DIRECT_EMAIL_STATEMENT}
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
