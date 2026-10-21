import type { Metadata } from "next";
import { SafeAnchor, SafeLink as Link } from "@/components/layout/SafeLink";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createPageMetadata } from "@/lib/seo";
import { SUPPORT_DESK_LABEL, SUPPORT_DESK_URL } from "@/lib/site/supportDesk";

export const metadata: Metadata = createPageMetadata({
  title: "Your data",
  description: "Download everything in your private Family History workspace, and how deleting works.",
  path: "/app/settings/data",
});

export const dynamic = "force-dynamic";

/**
 * Your data (Core §7): export now; deletion stated honestly. Self-service
 * deletion is not built yet (tracker AWF-0074), so this page says so instead
 * of showing a button that would leave files behind.
 */
export default function YourDataPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-wide text-stone-500">Settings</p>
        <h1 className="text-3xl font-semibold text-stone-900">Your data</h1>
        <p className="text-stone-600">Everything in your workspace is yours. Take a copy whenever you like.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Download everything</CardTitle>
          <CardDescription>
            One JSON file with every person, relationship, fact, source, citation, story, Queue item and
            AI connection in your workspace, with who made each one and when.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-stone-700">
          <a
            href="/api/vault/export"
            download
            className="inline-flex min-h-[44px] items-center rounded-md bg-stone-900 px-4 font-medium text-white hover:bg-stone-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
          >
            Download my export
          </a>
          <p>
            Photos and scans are listed in the file as records. Their original files are not inside it;
            open each one from its person or source to download it.
          </p>
          <p>A large tree can take a minute to prepare. Keep this tab open until the download finishes.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Deleting your account</CardTitle>
          <CardDescription>Not available from this page yet.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-stone-700">
          <p>
            Deleting has to remove every record and every stored copy of every file, so it is being built
            carefully rather than quickly. Until it is here, download your export first, then ask at{" "}
            <SafeAnchor className="underline" href={SUPPORT_DESK_URL} rel="noreferrer" target="_blank">
              {SUPPORT_DESK_LABEL}
            </SafeAnchor>{" "}
            for your workspace to be deleted.
          </p>
          <p>
            How deletion will work, and what it removes, is on <Link className="underline" href="/delete-account">Deleting your account</Link>.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your AI connections</CardTitle>
          <CardDescription>See, narrow or remove what each connected AI may do.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          <Link className="underline" href="/app/settings/ai">Open AI connections</Link>
        </CardContent>
      </Card>
    </div>
  );
}
