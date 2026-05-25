/**
 * CTASection Component
 * 
 * Purpose: Call-to-action section at bottom of marketing pages
 * 
 * Key Elements:
 * - Compelling headline
 * - Primary CTA button
 * - Secondary info
 * 
 * Dependencies:
 * - next/link
 * - @/components/ui/button
 * 
 * Last Updated: Initial setup
 */

import { Button } from "@/components/ui/button";
import { SafeLink } from "@/components/layout/SafeLink";
import { ArrowRight, Mail, Wrench } from "lucide-react";

export function CTASection() {
  return (
    <section className="relative overflow-hidden border-t border-[#b79f7a55] bg-[#173944] py-20 sm:py-24">
      <div className="absolute inset-0 bg-[linear-gradient(90deg,#ffffff12_1px,transparent_1px),linear-gradient(#ffffff10_1px,transparent_1px)] bg-[size:36px_36px]" />

      <div className="relative mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_0.8fr] lg:px-8">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#f2d7af66] bg-[#f7f3e81a] px-4 py-2 text-sm text-[#f2e1c4]">
            <Wrench className="h-4 w-4" />
            Useful now, still under construction
          </div>
          <h2 className="mt-8 max-w-3xl text-4xl leading-tight text-[#fff6e5] sm:text-5xl" data-display="true">
            Best for curious researchers, family historians, and beta testers.
          </h2>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-[#ecdeca]">
            Come in if you are comfortable with an evolving workflow and want to help shape what
            AI-assisted ancestor research and storytelling should become.
          </p>

          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <Button
              asChild
              size="lg"
              className="h-[3.25rem] rounded-full bg-[#f8ebd5] px-8 text-base font-semibold text-[#1d3540] shadow-[0_20px_30px_-24px_#000] hover:bg-[#fff2df]"
            >
              <SafeLink href="/app" className="flex items-center gap-2">
                Open the beta workspace
                <ArrowRight className="h-4 w-4" />
              </SafeLink>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-[3.25rem] rounded-full border-[#f3dfbe80] bg-transparent px-8 text-base text-[#fff4e1] hover:bg-[#f8ebd511] hover:text-[#fff4e1]"
            >
              <SafeLink
                href="mailto:features@discovertheirstories.com"
                className="flex items-center gap-2"
              >
                Send beta feedback
                <Mail className="h-4 w-4" />
              </SafeLink>
            </Button>
          </div>
        </div>

        <div className="border border-[#f3dfbe55] bg-[#f8ebd512] p-6 text-[#ecdeca]">
          <p className="text-xs uppercase tracking-[0.24em] text-[#f2d7af]">Good fit right now</p>
          <ul className="mt-5 space-y-4 text-sm leading-6">
            <li>People testing FamilySearch capture and import workflows.</li>
            <li>Researchers who want a vault-first place to collect evidence and context.</li>
            <li>Family historians experimenting with AI-generated story drafts.</li>
          </ul>
          <div className="my-6 h-px bg-[#f3dfbe33]" />
          <p className="text-xs uppercase tracking-[0.24em] text-[#f2d7af]">Not yet</p>
          <ul className="mt-5 space-y-4 text-sm leading-6">
            <li>Not a polished public genealogy platform.</li>
            <li>Not a finished publishing system.</li>
            <li>Not a replacement for careful researcher judgment.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
