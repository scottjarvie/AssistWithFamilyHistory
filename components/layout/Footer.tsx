/**
 * Footer Component
 * 
 * Purpose: Site footer for all pages
 * 
 * Key Elements:
 * - Logo and brand
 * - Navigation links
 * - Copyright
 * 
 * Dependencies:
 * - next/link
 * - lucide-react icons
 * 
 * Last Updated: Initial setup
 */

import { SafeLink } from "@/components/layout/SafeLink";
import { Compass } from "lucide-react";

export function Footer() {
  return (
    <footer className="relative overflow-hidden border-t border-[#2c4f5d] bg-[#132b35] py-14 text-[#d9cdb5]">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-8 md:flex-row">
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-full border border-[#f2d7af77] bg-[#f2d7af22]">
              <Compass className="h-5 w-5 text-[#f2d7af]" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#b8a987]">Assist With</p>
              <p className="mt-1 text-xl text-[#fff6e5]" data-display="true">Family History</p>
            </div>
          </div>

          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 md:gap-8">
            <SafeLink href="/features" className="inline-flex min-h-11 items-center transition-colors hover:text-[#fff6e5] md:pointer-fine:min-h-0">
              Features
            </SafeLink>
            <SafeLink href="/extension" className="inline-flex min-h-11 items-center transition-colors hover:text-[#fff6e5] md:pointer-fine:min-h-0">
              Extension
            </SafeLink>
            <SafeLink href="/about" className="inline-flex min-h-11 items-center transition-colors hover:text-[#fff6e5] md:pointer-fine:min-h-0">
              About
            </SafeLink>
            <SafeLink href="/roadmap" className="inline-flex min-h-11 items-center transition-colors hover:text-[#fff6e5] md:pointer-fine:min-h-0">
              Roadmap
            </SafeLink>
            <SafeLink href="/updates" className="inline-flex min-h-11 items-center transition-colors hover:text-[#fff6e5] md:pointer-fine:min-h-0">
              Updates
            </SafeLink>
            <SafeLink href="/ai" className="inline-flex min-h-11 items-center transition-colors hover:text-[#fff6e5] md:pointer-fine:min-h-0">
              Connect AI
            </SafeLink>
            <SafeLink href="/privacy" className="inline-flex min-h-11 items-center transition-colors hover:text-[#fff6e5] md:pointer-fine:min-h-0">
              Privacy
            </SafeLink>
            <SafeLink href="/contact" className="inline-flex min-h-11 items-center transition-colors hover:text-[#fff6e5] md:pointer-fine:min-h-0">
              Contact
            </SafeLink>
          </nav>

          <p className="max-w-xs text-sm leading-6 text-[#b8a987]">
            A durable research-to-story workspace for you and your chosen AI.
          </p>
        </div>
      </div>
    </footer>
  );
}
