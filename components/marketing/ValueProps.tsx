/**
 * ValueProps Component
 * 
 * Purpose: Section highlighting key value propositions
 * 
 * Key Elements:
 * - Four key value props with icons
 * - Clean, scannable layout
 * 
 * Dependencies:
 * - lucide-react icons
 * 
 * Last Updated: Initial setup
 */

import { Search, Brain, Download, Heart } from "lucide-react";

const valueProps = [
  {
    icon: Search,
    title: "Discovery over data entry",
    description: "Reveal context hidden in records.",
  },
  {
    icon: Brain,
    title: "Intelligence tuned for genealogy",
    description: "AI prompts built for genealogical evidence.",
  },
  {
    icon: Download,
    title: "Future-proof outputs",
    description: "Export everything in readable formats.",
  },
  {
    icon: Heart,
    title: "Heart-centered storytelling",
    description: "Turn records into stories families remember.",
  },
];

export function ValueProps() {
  return (
    <section className="py-24 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-14 text-center">
          <p className="text-xs uppercase tracking-[0.24em] text-[#5f665f]">Why This Matters</p>
          <h2 className="mt-5 text-4xl text-[#1d212a] sm:text-5xl" data-display="true">
            Why Assist With Family History?
          </h2>
          <p className="mx-auto mt-5 max-w-3xl text-lg leading-relaxed text-[#4e5a64]">
            Find more, write better, preserve what matters.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {valueProps.map((prop) => (
            <div key={prop.title} className="rounded-2xl border border-[#c9b79190] bg-[#fdf9f0cc] p-6 shadow-[0_26px_35px_-34px_#111]">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-[#9f5a2d55] bg-[#efe0c5]">
                  <prop.icon className="h-5 w-5 text-[#9f5a2d]" />
                </div>
                <div>
                  <h3 className="text-2xl leading-tight text-[#1d212a]" data-display="true">
                    {prop.title}
                  </h3>
                  <p className="mt-3 text-[15px] leading-relaxed text-[#4e5a64]">
                    {prop.description}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-14 rounded-[1.75rem] border border-[#9f5a2d55] bg-gradient-to-br from-[#efe3cb] to-[#f7f1e2] p-7 shadow-[0_28px_44px_-36px_#111] sm:p-10">
          <p className="text-xs uppercase tracking-[0.22em] text-[#6d6249]">Guiding Vision</p>
          <div className="mt-4 grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <p className="text-3xl leading-tight text-[#24323e] sm:text-4xl" data-display="true">
              Discover who they were. Tell it clearly. Pass it on.
            </p>
            <p className="text-sm leading-relaxed text-[#4e5a64]">
              AI helps you move faster. You remain the historian.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
