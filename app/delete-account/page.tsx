import type { Metadata } from "next";
import { MarketingNav } from "@/components/layout/MarketingNav";
import { Footer } from "@/components/layout/Footer";
import { SafeAnchor, SafeLink as Link } from "@/components/layout/SafeLink";
import { createPageMetadata } from "@/lib/seo";
import { SUPPORT_DESK_LABEL, SUPPORT_DESK_URL } from "@/lib/site/supportDesk";

export const metadata: Metadata = createPageMetadata({
  title: "Deleting your account",
  description: "How to take your data out of Assist With Family History and have your workspace deleted.",
  path: "/delete-account",
});

/**
 * The public explanation of deletion (Core §7; app stores ask for one).
 * Honest about today: export is self-service, deletion is by request until
 * the in-app deletion (tracker AWF-0074) ships.
 */
export default function DeleteAccountPage() {
  return (
    <div className="min-h-screen bg-stone-50">
      <MarketingNav />
      <main className="pt-24 pb-16">
        <article className="mx-auto max-w-3xl space-y-6 px-4 text-stone-700 sm:px-6 lg:px-8">
          <p className="text-sm font-medium uppercase tracking-wide text-stone-500">Your data</p>
          <h1 className="text-4xl font-bold text-stone-900">Deleting your account</h1>
          <p className="text-lg">
            Your family history is yours. You can take a full copy at any time, and you can have
            everything Assist With Family History holds for you deleted.
          </p>

          <h2 className="text-2xl font-semibold text-stone-900">Today</h2>
          <ol className="list-decimal space-y-2 pl-6">
            <li>
              Sign in and open <strong>Your data</strong> (<Link className="underline" href="/app/settings/data">/app/settings/data</Link>).
            </li>
            <li>Download your export. It holds every record, with who made it and when.</li>
            <li>
              Ask at{" "}
              <SafeAnchor className="underline" href={SUPPORT_DESK_URL} rel="noreferrer" target="_blank">
                {SUPPORT_DESK_LABEL}
              </SafeAnchor>{" "}
              for your workspace to be deleted. Deleting from inside the app is being built and is not
              available yet.
            </li>
          </ol>

          <h2 className="text-2xl font-semibold text-stone-900">What deleting removes</h2>
          <p>
            Every person, relationship, fact, source, citation, note, story and Queue item in your
            workspace, with their history; every photo, scan and document you or your AI uploaded,
            including every stored copy of each; and your AI connections.
          </p>

          <h2 className="text-2xl font-semibold text-stone-900">What is kept elsewhere</h2>
          <p>
            Your sign-in is held by Clerk, the service this site uses for signing in; remove it from
            your account menu. Your AI app keeps its own copy of your conversations with it, which this
            site cannot reach. Anything you saw on FamilySearch stays on FamilySearch.
          </p>
        </article>
      </main>
      <Footer />
    </div>
  );
}
