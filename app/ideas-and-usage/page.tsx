import type { Metadata } from "next";
import { MarketingNav } from "@/components/layout/MarketingNav";
import { Footer } from "@/components/layout/Footer";
import { SafeLink as Link } from "@/components/layout/SafeLink";
import { createPageMetadata } from "@/lib/seo";
import { IDEAS, IDEAS_INTRO } from "@/lib/site/ideas";

export const metadata: Metadata = createPageMetadata({
  title: "Ideas and Usage",
  description: "What you and your own AI can do with a private family history workspace, with prompts to try.",
  path: "/ideas-and-usage",
});

/**
 * Ideas and Usage (Core §6): situations, what your AI already does, what
 * Family History adds, and a prompt to try. Examples, not claims about any
 * particular AI app.
 */
export default function IdeasAndUsagePage() {
  return (
    <div className="min-h-screen bg-stone-50">
      <MarketingNav />
      <main className="pt-24 pb-16">
        <div className="mx-auto max-w-4xl space-y-8 px-4 sm:px-6 lg:px-8">
          <header className="space-y-3">
            <p className="text-sm font-medium uppercase tracking-wide text-stone-500">Ideas and Usage</p>
            <h1 className="text-4xl font-bold text-stone-900">What could your AI do with a memory of your family?</h1>
            <p className="text-lg text-stone-600">{IDEAS_INTRO}</p>
          </header>
          <ol className="space-y-4">
            {IDEAS.map((idea) => (
              <li key={idea.id} className="rounded-lg border border-stone-200 bg-white p-5">
                <h2 className="text-xl font-semibold text-stone-900">{idea.situation}</h2>
                <dl className="mt-3 grid gap-3 text-sm text-stone-700 md:grid-cols-2">
                  <div>
                    <dt className="font-medium text-stone-900">What your AI already does</dt>
                    <dd>{idea.ai}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-stone-900">What Family History adds</dt>
                    <dd>{idea.site}</dd>
                  </div>
                  <div className="md:col-span-2">
                    <dt className="font-medium text-stone-900">A prompt to try</dt>
                    <dd><q>{idea.prompt}</q></dd>
                  </div>
                </dl>
              </li>
            ))}
          </ol>
          <p className="text-sm text-stone-600">
            These are examples of the help that becomes possible, not a description of any particular AI
            app. How to connect yours is on <Link className="underline" href="/ai">Your AI</Link>.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
