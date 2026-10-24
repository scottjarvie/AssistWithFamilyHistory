import type { Metadata } from "next";
import { SafeLink as Link } from "@/components/layout/SafeLink";
import { VaultStateCard } from "@/components/vault/VaultStateCard";
import { createPageMetadata } from "@/lib/seo";
import {
  getAuthedConvexClient,
  getConvexRuntimeIssue,
  getConvexUnavailableState,
  isConvexConfigured,
} from "@/lib/convex/server";
import { api } from "@/convex/_generated/api";
import { getVaultAccessContext } from "@/lib/vault/server";
import { availableLibraryPrompts } from "@/lib/library/prompts";

export const metadata: Metadata = createPageMetadata({
  title: "Library",
  description: "Your research, the prompts that work well with your AI, and the background resources you have gathered.",
  path: "/app/library",
});

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  todo: "To do",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
};

/**
 * The Library (Core §4b): three shelves built on records the workspace already
 * keeps. Research is research findings and tasks; Prompts are the prompts this
 * product ships; Resources are place-and-era research packs and topics. No
 * parallel store.
 */
export default async function LibraryPage() {
  if (!isConvexConfigured()) {
    const issue = getConvexUnavailableState("Library", "The Library reads your research findings and resources.");
    return (
      <div className="p-6 sm:p-8">
        <VaultStateCard title={issue.title} description={issue.description} />
      </div>
    );
  }

  const client = await getAuthedConvexClient();
  const { vaultOwnerId } = await getVaultAccessContext();
  let shelves;
  try {
    shelves = await client.action(api.yourData.getLibraryShelves, { vaultOwnerId });
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);
    return (
      <div className="p-6 sm:p-8">
        <VaultStateCard title={issue.title} description={issue.description} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-10 p-4 sm:p-8">
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-wide text-stone-500">Library</p>
        <h1 className="text-3xl font-semibold text-stone-900">Your Library</h1>
        <p className="max-w-2xl text-stone-600">
          Three shelves: the research you and your AI have done, prompts that work well, and the
          background you have gathered about places and times.
        </p>
        <nav aria-label="Shelves" className="flex flex-wrap gap-2 pt-2 text-sm">
          {[["#research", "Research"], ["#prompts", "Prompts"], ["#resources", "Resources"]].map(([href, label]) => (
            <a key={href} href={href} className="inline-flex min-h-[44px] items-center rounded-full border border-stone-300 bg-white px-4 hover:border-stone-500">
              {label}
            </a>
          ))}
        </nav>
      </header>

      <section id="research" aria-labelledby="research-heading" className="space-y-3">
        <h2 id="research-heading" className="text-xl font-semibold text-stone-900">Research</h2>
        {shelves.research.length === 0 ? (
          <p className="text-stone-600">
            No research yet. Findings and tasks you or your AI save appear here. Start from a person on{" "}
            <Link className="underline" href="/app/research">Research</Link>.
          </p>
        ) : (
          <ul className="divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
            {shelves.research.map((row) => (
              <li key={`${row.kind}-${row.id}`} className="flex flex-wrap items-baseline justify-between gap-2 p-4 text-sm">
                <span className="min-w-0 flex-1 text-stone-900">{row.title}</span>
                <span className="text-stone-600">
                  {row.kind === "task" ? "Task" : "Finding"} · {STATUS_LABELS[row.status] ?? row.status}
                  {row.byAi ? " · by your AI" : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="prompts" aria-labelledby="prompts-heading" className="space-y-3">
        <h2 id="prompts-heading" className="text-xl font-semibold text-stone-900">Prompts</h2>
        <p className="text-stone-600">Copy one into your AI. Each one works with the tools on <Link className="underline" href="/ai">Your AI</Link>.</p>
        <ul className="space-y-3">
          {availableLibraryPrompts().map((prompt) => (
            <li key={prompt.id} className="rounded-lg border border-stone-200 bg-white p-4">
              <details>
                <summary className="min-h-[44px] cursor-pointer font-medium text-stone-900">
                  {prompt.title}
                  <span className="block text-sm font-normal text-stone-600">{prompt.useWhen}</span>
                </summary>
                <pre className="mt-3 whitespace-pre-wrap break-words rounded bg-stone-100 p-3 text-sm text-stone-800">{prompt.text}</pre>
              </details>
            </li>
          ))}
        </ul>
      </section>

      <section id="resources" aria-labelledby="resources-heading" className="space-y-3">
        <h2 id="resources-heading" className="text-xl font-semibold text-stone-900">Resources</h2>
        {shelves.resources.length === 0 ? (
          <p className="text-stone-600">
            No resources yet. Place-and-era research packs and topics (a parish, a migration, a trade)
            appear here once you or your AI save them. See <Link className="underline" href="/app/places">Places</Link>.
          </p>
        ) : (
          <ul className="divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
            {shelves.resources.map((row) => (
              <li key={`${row.kind}-${row.id}`} className="flex flex-wrap items-baseline justify-between gap-2 p-4 text-sm">
                <span className="min-w-0 flex-1 text-stone-900">{row.title}</span>
                <span className="text-stone-600">
                  {row.kind === "topic" ? "Topic" : "Research pack"} · {row.detail}
                  {row.sources ? ` · ${row.sources} source${row.sources === 1 ? "" : "s"}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
