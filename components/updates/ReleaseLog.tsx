"use client";

import { useState } from "react";
import { ArrowUpCircle, CheckCircle2, PlusCircle, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  releaseItemsForCategory,
  type ReleaseCategory,
  type ReleaseEntry,
} from "@/lib/releaseNotes";

const sections: Array<{ key: ReleaseCategory; label: string; icon: typeof PlusCircle; accent: string }> = [
  { key: "created", label: "Created", icon: PlusCircle, accent: "border-[#4f765d] text-[#4f765d]" },
  { key: "fixed", label: "Fixed", icon: Wrench, accent: "border-[#9f5a2d] text-[#9f5a2d]" },
  { key: "upgraded", label: "Upgraded", icon: ArrowUpCircle, accent: "border-[#234d5e] text-[#234d5e]" },
];

function formatReleaseDateTime(entry: ReleaseEntry) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
    timeZone: entry.timezone, timeZoneName: "short",
  }).format(new Date(entry.releasedAt));
}

export function ReleaseLog({ entries }: { entries: ReleaseEntry[] }) {
  const [learn, setLearn] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Release note reading depth">
        <button type="button" aria-pressed={!learn} onClick={() => setLearn(false)} className={`min-h-11 rounded-full border px-5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#245a43] ${!learn ? "border-[#245a43] bg-[#245a43] text-white" : "border-[#cfc3af] bg-white text-[#3f392d]"}`}>Quick read</button>
        <button type="button" aria-pressed={learn} onClick={() => setLearn(true)} className={`min-h-11 rounded-full border px-5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#245a43] ${learn ? "border-[#245a43] bg-[#245a43] text-white" : "border-[#cfc3af] bg-white text-[#3f392d]"}`}>Learn the changes</button>
      </div>

      <div className="space-y-6">
        {entries.map((entry) => (
          <article key={`${entry.version}-${entry.releasedAt}`} id={`v${entry.version}`} className="border border-[#d8c7a7] bg-white shadow-sm scroll-mt-24">
            <header className="border-b border-[#eadfc9] px-5 py-5 sm:px-7">
              <div className="flex flex-wrap items-center gap-3">
                <Badge className="border-[#9f5a2d33] bg-[#f8f4ec] text-[#7c4425] hover:bg-[#f8f4ec]">v{entry.version}</Badge>
                <Badge className="border-[#245a4333] bg-[#edf4ef] text-[#245a43] hover:bg-[#edf4ef]">{entry.status}</Badge>
                <time dateTime={entry.releasedAt} className="text-sm font-medium text-[#6f664f]">{formatReleaseDateTime(entry)}</time>
              </div>
              <h2 className="mt-4 text-2xl font-semibold text-[#1d212a]">{entry.title}</h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-[#625947]">{entry.summary}</p>
            </header>

            <div className="grid md:grid-cols-3">
              {sections.map((section) => {
                const Icon = section.icon;
                const items = releaseItemsForCategory(entry, section.key);
                const stateKey = `${entry.version}:${section.key}`;
                const showAll = Boolean(expanded[stateKey]);
                return (
                  <section key={section.key} className="border-t border-[#eadfc9] px-5 py-5 first:border-t-0 md:border-l md:border-t-0 md:first:border-l-0 sm:px-7">
                    <div className={`flex items-center gap-2 border-l-2 pl-3 ${section.accent}`}>
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      <h3 className="text-sm font-semibold uppercase tracking-[0.16em]">{section.label}</h3>
                    </div>
                    <ul className="mt-4 space-y-4">
                      {items.map((item, index) => (
                        <li key={item.id} className={`${!showAll && index >= 3 ? "hidden" : ""} flex gap-3 text-sm leading-6 text-[#3f392d]`}>
                          <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-[#4f765d]" aria-hidden="true" />
                          <div>
                            <p>{item.short}</p>
                            {learn ? <div className="mt-2 space-y-2 border-l border-[#d8c7a7] pl-3 text-[#625947]"><p>{item.long.what}</p><p>{item.long.why}</p>{item.long.where ? <p><strong>Where:</strong> {item.long.where}</p> : null}</div> : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                    {items.length > 3 ? <button type="button" aria-expanded={showAll} onClick={() => setExpanded((current) => ({ ...current, [stateKey]: !showAll }))} className="mt-5 min-h-11 rounded-full border border-[#cfc3af] px-4 text-sm font-semibold text-[#245a43] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#245a43]">{showAll ? "Show only top 3" : `Show all ${items.length}`}</button> : null}
                  </section>
                );
              })}
            </div>

            {entry.whatToCheck?.length ? <section className="border-t border-[#eadfc9] bg-[#fbf8f1] px-5 py-5 sm:px-7"><h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-[#7c4425]">What to check</h3><ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-[#625947]">{entry.whatToCheck.map((item) => <li key={item}>{item}</li>)}</ul></section> : null}
          </article>
        ))}
      </div>
    </div>
  );
}
