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
  title: "Contact",
  description:
    "Support, feature requests, and privacy questions for Assist With Family History all go through Assist With Life Support.",
  path: "/contact",
});

const contactItems = [
  {
    title: "General Support",
    label: "Open a support request",
    description: "Questions about setup, usage, and troubleshooting.",
  },
  {
    title: "Feature Requests",
    label: "Share product feedback",
    description: "Suggestions for new tools, improvements, and workflows.",
  },
  {
    title: "Privacy Questions",
    label: "Ask a privacy question",
    description: "Questions about storage, processing, or data handling.",
  },
];

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-stone-50">
      <MarketingNav />
      <main className="pt-24 pb-16">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10 text-center">
            <h1 className="mb-4 text-4xl font-bold text-stone-900">Contact</h1>
            <p className="text-stone-500">
              Support for every Assist With site runs through{" "}
              <SafeAnchor
                className="text-amber-700 hover:underline"
                href={SUPPORT_DESK_URL}
                rel="noreferrer"
                target="_blank"
              >
                {SUPPORT_DESK_LABEL}
              </SafeAnchor>
              . {NO_DIRECT_EMAIL_STATEMENT} Bring a support request, feedback, or a
              privacy question there and it reaches the same place.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {contactItems.map((item) => (
              <article key={item.title} className="rounded-xl border border-stone-200 bg-white p-6">
                <h2 className="mb-2 text-lg font-semibold text-stone-900">{item.title}</h2>
                <p className="mb-4 text-sm text-stone-500">{item.description}</p>
                <SafeAnchor
                  className="text-amber-700 hover:underline"
                  href={SUPPORT_DESK_URL}
                  rel="noreferrer"
                  target="_blank"
                >
                  {item.label}
                </SafeAnchor>
              </article>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
