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
import { FamilyRow } from "./FamilyRow";
import { SiteMark } from "./SiteMark";

export function Footer() {
  return (
    <div><FamilyRow /><footer className="relative overflow-hidden border-t border-[#2c4f5d] bg-[#132b35] py-14 text-[#d9cdb5]">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-8 md:flex-row">
          <div className="flex items-center gap-3">
            <SiteMark className="h-10 w-10 flex-shrink-0 rounded-lg border border-[#f2d7af77]" />
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
            <SafeLink href="/ideas-and-usage" className="inline-flex min-h-11 items-center transition-colors hover:text-[#fff6e5] md:pointer-fine:min-h-0">
              Ideas
            </SafeLink>
            <SafeLink href="/support" className="inline-flex min-h-11 items-center transition-colors hover:text-[#fff6e5] md:pointer-fine:min-h-0">
              Support
            </SafeLink>
            <SafeLink href="/delete-account" className="inline-flex min-h-11 items-center transition-colors hover:text-[#fff6e5] md:pointer-fine:min-h-0">
              Deleting your account
            </SafeLink>
          </nav>

          <p className="max-w-xs text-sm leading-6 text-[#b8a987]">
            A durable research-to-story workspace for you and your chosen AI.
          </p>
        </div>
      </div>
    </footer></div>
  );
}
