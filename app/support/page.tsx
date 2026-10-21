import type { Metadata } from "next";
import { MarketingNav } from "@/components/layout/MarketingNav";
import { Footer } from "@/components/layout/Footer";
import { SafeAnchor, SafeLink as Link } from "@/components/layout/SafeLink";
import { createPageMetadata } from "@/lib/seo";
import { NO_DIRECT_EMAIL_STATEMENT, SUPPORT_DESK_LABEL, SUPPORT_DESK_URL } from "@/lib/site/supportDesk";

export const metadata: Metadata = createPageMetadata({
  title: "Support",
  description: "Getting help with Assist With Family History: one support desk for every Assist With site.",
  path: "/support",
});

/** Support (Core §12): one desk for the whole family, no inbox here. */
export default function SupportPage() {
  return (
    <div className="min-h-screen bg-stone-50">
      <MarketingNav />
      <main className="pt-24 pb-16">
        <article className="mx-auto max-w-3xl space-y-6 px-4 text-stone-700 sm:px-6 lg:px-8">
          <p className="text-sm font-medium uppercase tracking-wide text-stone-500">Getting help</p>
          <h1 className="text-4xl font-bold text-stone-900">Help comes from one place</h1>
          <p className="text-lg">
            Something broken, something confusing, or an idea: all of it goes to {SUPPORT_DESK_LABEL},
            the desk that serves every Assist With site. {NO_DIRECT_EMAIL_STATEMENT}
          </p>
          <SafeAnchor
            className="inline-flex min-h-[44px] items-center rounded-md bg-stone-900 px-4 font-medium text-white hover:bg-stone-700"
            href={SUPPORT_DESK_URL}
            rel="noreferrer"
            target="_blank"
          >
            Open the support desk
          </SafeAnchor>

          <h2 className="text-2xl font-semibold text-stone-900">What to send</h2>
          <ul className="list-disc space-y-2 pl-6">
            <li>What you were doing, what happened, and what you expected instead.</li>
            <li>Which part it was: a person or source page, the Queue, an import, or your AI&apos;s connection.</li>
            <li>Improvements count too. &ldquo;This was confusing&rdquo; is worth sending.</li>
          </ul>

          <h2 className="text-2xl font-semibold text-stone-900">What not to send</h2>
          <p>
            The desk cannot see your workspace. Please don&apos;t paste passwords, your FamilySearch sign-in,
            or private details about living relatives into it.
          </p>

          <h2 className="text-2xl font-semibold text-stone-900">What support cannot do</h2>
          <p>
            Nobody at the desk can do your research or confirm a relationship. What your own AI can do
            here, and exactly how, is on <Link className="underline" href="/ai">Your AI</Link>.
          </p>
        </article>
      </main>
      <Footer />
    </div>
  );
}
