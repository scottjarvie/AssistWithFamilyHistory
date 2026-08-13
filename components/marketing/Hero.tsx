import { ArrowRight, BookOpenCheck, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SafeLink } from "@/components/layout/SafeLink";

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-[#b79f7a55] bg-[#f6efe1] pt-28 sm:pt-32">
      <div className="absolute inset-0 bg-[linear-gradient(90deg,#d7cfbf66_1px,transparent_1px),linear-gradient(#d7cfbf55_1px,transparent_1px)] bg-[size:42px_42px]" />
      <div className="absolute inset-0 bg-[linear-gradient(135deg,#f8f4ec_0%,#f3ead7_46%,#e6dac2_100%)] opacity-90" />
      <div className="absolute left-0 right-0 top-28 h-px bg-[#9f5a2d66]" />

      <div className="relative mx-auto grid min-h-[calc(100vh-4.5rem)] max-w-7xl content-center gap-10 px-4 pb-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
        <div className="animate-rise-in">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#234d5e66] bg-[#fffaf2cc] px-4 py-2 text-sm text-[#234d5e] shadow-[0_18px_35px_-30px_#111]">
            <BookOpenCheck className="h-4 w-4" />
            <span className="font-semibold">Soft launch · private workspace · honest evidence</span>
          </div>

          <h1
            className="mt-8 max-w-5xl text-5xl leading-[0.98] text-[#1d212a] sm:text-6xl lg:text-7xl"
            data-display="true"
          >
            Bring your chosen AI. Keep the research trail.
          </h1>

          <p className="mt-7 max-w-3xl text-lg leading-8 text-[#3b4650] sm:text-xl">
            Assist With Family History keeps people, relationships, events, sources, questions,
            findings, and stories connected after the chat ends—so you can see where each detail
            came from, correct what changes, and tell source-aware stories with care.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button
              asChild
              className="h-12 rounded-full bg-[#234d5e] px-6 text-[#f7f3e8] hover:bg-[#1f4554]"
            >
              <SafeLink href="/app">
                Open your workspace
                <ArrowRight className="h-4 w-4" />
              </SafeLink>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-12 rounded-full border-[#9f5a2d66] bg-[#fffaf2aa] px-6 text-[#573d2a] hover:bg-[#f4e5ca]"
            >
              <SafeLink href="/ai">Connect your AI</SafeLink>
            </Button>
          </div>

          <div className="mt-8 flex max-w-3xl items-start gap-3 border-l-2 border-[#9f5a2d] pl-4 text-sm leading-6 text-[#5d5548]">
            <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#476553]" />
            <p>
              You remain the authority. Your AI reasons and researches; Family History preserves
              the durable record. Sharing and publication stay separate, explicit human decisions.
            </p>
          </div>
        </div>

        <div className="relative hidden lg:block">
          <div className="absolute left-10 top-1/2 h-[34rem] w-[34rem] -translate-y-1/2 rotate-3 border border-[#b79f7a] bg-[#efe4cd]" />
          <div className="relative ml-auto mt-8 max-w-[31rem] border border-[#7b6a50] bg-[#fffaf2] shadow-[18px_22px_0_#234d5e22]">
            <div className="border-b border-[#c9b791] bg-[#e8dcc4] px-5 py-3">
              <p className="text-xs uppercase tracking-[0.24em] text-[#6d6249]">A connected research trail</p>
            </div>
            <div className="space-y-5 p-5">
              {[
                ["Clue", "A record, photograph, memory, place, or unresolved family question"],
                ["Evidence", "Sources, citations, conflicts, confidence, and research findings stay linked"],
                ["Story", "A private draft with a path back when understanding changes"],
              ].map(([label, detail]) => (
                <div key={label} className="border-l-4 border-[#9f5a2d] bg-[#f7f1e2] px-4 py-3">
                  <p className="text-sm font-semibold text-[#1d212a]">{label}</p>
                  <p className="mt-1 text-sm leading-6 text-[#4e5a64]">{detail}</p>
                </div>
              ))}
              <div className="grid grid-cols-3 gap-2 pt-2">
                {["People", "Places", "Sources"].map((label, index) => (
                  <div key={label} className="border border-[#d7cfbf] bg-white px-3 py-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-[#6d6249]">{label}</p>
                    <p className="mt-2 text-2xl text-[#234d5e]" data-display="true">
                    {index === 0 ? "Lives" : index === 1 ? "Context" : "Receipts"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
