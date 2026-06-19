import type { Metadata } from "next";
import { ArrowUpCircle, CheckCircle2, PlusCircle, ShieldCheck, Wrench } from "lucide-react";
import { Footer } from "@/components/layout/Footer";
import { MarketingNav } from "@/components/layout/MarketingNav";
import { Badge } from "@/components/ui/badge";
import { releaseNotes, type ReleaseEntry } from "@/lib/releaseNotes";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "What's New",
  description:
    "Release notes for Discover Their Stories, including created, fixed, and upgraded changes.",
  path: "/updates",
});

type ReleaseSectionKey = "created" | "fixed" | "upgraded";

const dateFormatter = new Intl.DateTimeFormat("en", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const releaseSections: Array<{
  key: ReleaseSectionKey;
  label: string;
  icon: typeof PlusCircle;
  accentClassName: string;
}> = [
  {
    key: "created",
    label: "Created",
    icon: PlusCircle,
    accentClassName: "border-[#4f765d] text-[#4f765d]",
  },
  {
    key: "fixed",
    label: "Fixed",
    icon: Wrench,
    accentClassName: "border-[#9f5a2d] text-[#9f5a2d]",
  },
  {
    key: "upgraded",
    label: "Upgraded",
    icon: ArrowUpCircle,
    accentClassName: "border-[#234d5e] text-[#234d5e]",
  },
];

function formatReleaseDate(value: string) {
  return dateFormatter.format(new Date(`${value}T00:00:00Z`));
}

function ReleaseEntryCard({ entry }: { entry: ReleaseEntry }) {
  return (
    <article className="border border-[#d8c7a7] bg-white shadow-sm">
      <div className="border-b border-[#eadfc9] px-5 py-5 sm:px-7">
        <div className="flex flex-wrap items-center gap-3">
          <Badge className="border-[#9f5a2d33] bg-[#f8f4ec] text-[#7c4425] hover:bg-[#f8f4ec]">
            v{entry.version}
          </Badge>
          <span className="text-sm font-medium text-[#6f664f]">
            {formatReleaseDate(entry.date)}
          </span>
        </div>
        <h2 className="mt-4 text-2xl font-semibold text-[#1d212a]">{entry.title}</h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-[#625947]">{entry.summary}</p>
      </div>

      <div className="grid gap-0 md:grid-cols-3">
        {releaseSections.map((section) => {
          const Icon = section.icon;
          const items = entry[section.key];

          return (
            <section
              key={section.key}
              className="border-t border-[#eadfc9] px-5 py-5 first:border-t-0 md:border-l md:border-t-0 md:first:border-l-0 sm:px-7"
            >
              <div className={`flex items-center gap-2 border-l-2 pl-3 ${section.accentClassName}`}>
                <Icon className="h-4 w-4" />
                <h3 className="text-sm font-semibold uppercase tracking-[0.16em]">
                  {section.label}
                </h3>
              </div>
              <ul className="mt-4 space-y-3">
                {items.map((item) => (
                  <li key={item} className="flex gap-3 text-sm leading-6 text-[#3f392d]">
                    <CheckCircle2 className="mt-1 h-4 w-4 flex-shrink-0 text-[#4f765d]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </article>
  );
}

export default function UpdatesPage() {
  const latestRelease = releaseNotes[0];

  return (
    <div className="min-h-screen bg-[#f8f4ec]">
      <MarketingNav />
      <main className="pt-24">
        <section className="border-b border-[#d8c7a7] bg-[#1f2f35] px-4 py-12 text-white sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl">
            <Badge className="mb-5 bg-white/10 text-white hover:bg-white/10">
              Product updates
            </Badge>
            <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-5xl font-semibold leading-[0.95] sm:text-6xl">
              What&apos;s New
            </h1>
            <div className="mt-5 flex flex-wrap items-center gap-3 text-sm font-medium text-[#d9cdb5]">
              <span>Current version v{latestRelease.version}</span>
              <span className="h-1 w-1 rounded-full bg-[#d9cdb5]" aria-hidden="true" />
              <span>Updated {formatReleaseDate(latestRelease.date)}</span>
            </div>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-[#d9cdb5]">
              A concise log of shipped, user-facing changes for the private beta.
              Release notes stay separate from private family data and source evidence.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="mb-5 flex items-start gap-3 border border-[#d8c7a7] bg-white px-5 py-4 text-sm leading-6 text-[#625947]">
            <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#234d5e]" />
            <p>
              Privacy boundary: this page is public and static. It does not read vault data,
              imported FamilySearch records, memories, notes, or private research artifacts.
            </p>
          </div>

          <div className="space-y-5">
            {releaseNotes.map((entry) => (
              <ReleaseEntryCard key={`${entry.version}-${entry.date}`} entry={entry} />
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
