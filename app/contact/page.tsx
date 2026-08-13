import type { Metadata } from "next";
import { MarketingNav } from "@/components/layout/MarketingNav";
import { Footer } from "@/components/layout/Footer";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Contact",
  description: "Contact information for support, feature requests, and privacy questions.",
  path: "/contact",
});

const contactItems = [
  {
    title: "General Support",
    email: "support@discovertheirstories.com",
    label: "Email support",
    description: "Questions about setup, usage, and troubleshooting.",
  },
  {
    title: "Feature Requests",
    email: "features@discovertheirstories.com",
    label: "Share product feedback",
    description: "Suggestions for new tools, improvements, and workflows.",
  },
  {
    title: "Privacy Questions",
    email: "privacy@discovertheirstories.com",
    label: "Contact the privacy team",
    description: "Questions about local storage, processing, or data handling.",
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
              Reach out with support requests, feedback, or ideas for the roadmap.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {contactItems.map((item) => (
              <article key={item.title} className="rounded-xl border border-stone-200 bg-white p-6">
                <h2 className="mb-2 text-lg font-semibold text-stone-900">{item.title}</h2>
                <p className="mb-4 text-sm text-stone-500">{item.description}</p>
                <a className="text-amber-700 hover:underline" href={`mailto:${item.email}`}>
                  {item.label}
                </a>
              </article>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
