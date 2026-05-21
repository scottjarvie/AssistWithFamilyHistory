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

import Link from "next/link";
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
              <p className="text-xl text-[#fff6e5]" data-display="true">Discover Their Stories</p>
              <p className="text-[11px] uppercase tracking-[0.22em] text-[#b8a987]">AI Heritage Studio</p>
            </div>
          </div>

          <nav className="flex flex-wrap items-center justify-center gap-6 md:gap-8">
            <Link href="/features" className="transition-colors hover:text-[#fff6e5]" suppressHydrationWarning>
              Features
            </Link>
            <Link href="/extension" className="transition-colors hover:text-[#fff6e5]" suppressHydrationWarning>
              Extension
            </Link>
            <Link href="/about" className="transition-colors hover:text-[#fff6e5]" suppressHydrationWarning>
              About
            </Link>
            <Link href="/roadmap" className="transition-colors hover:text-[#fff6e5]" suppressHydrationWarning>
              Roadmap
            </Link>
            <Link href="/privacy" className="transition-colors hover:text-[#fff6e5]" suppressHydrationWarning>
              Privacy
            </Link>
            <Link href="/contact" className="transition-colors hover:text-[#fff6e5]" suppressHydrationWarning>
              Contact
            </Link>
          </nav>

          <p className="max-w-xs text-sm leading-6 text-[#b8a987]">
            Public beta workspace for evidence-grounded ancestor stories.
          </p>
        </div>
      </div>
    </footer>
  );
}
