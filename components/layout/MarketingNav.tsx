"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Compass, Menu, Sparkles, X } from "lucide-react";
import { useState } from "react";

const navLinks = [
  { href: "/features", label: "Features" },
  { href: "/extension", label: "Extension" },
  { href: "/about", label: "About" },
  { href: "/roadmap", label: "Roadmap" },
];

export function MarketingNav() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav className="fixed inset-x-0 top-0 z-50 border-b border-[#b79f7a55] bg-[#f8f4ec]/80 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-[4.5rem] items-center justify-between">
          <Link href="/" className="group flex items-center gap-3" suppressHydrationWarning>
            <div className="relative flex h-10 w-10 items-center justify-center rounded-full border border-[#b79f7a77] bg-[#efe4cd] shadow-[0_10px_30px_-20px_#000] transition-transform duration-300 group-hover:scale-105">
              <div className="absolute inset-1 rounded-full border border-[#c57d3980] animate-pulse-ring" />
              <Compass className="h-5 w-5 text-[#234d5e]" />
            </div>
            <div className="hidden sm:block">
              <p className="text-xl font-semibold leading-none text-[#1d212a]" data-display="true">
                Discover Their Stories
              </p>
              <p className="mt-1 text-[11px] uppercase tracking-[0.22em] text-[#6f664f]">
                AI Heritage Studio
              </p>
            </div>
          </Link>

          <div className="hidden items-center gap-8 md:flex">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium tracking-wide text-[#2e3d46] transition-colors hover:text-[#9f5a2d]"
                suppressHydrationWarning
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="hidden md:block">
            <Button
              asChild
              className="h-11 rounded-full border border-[#1f45547a] bg-[#234d5e] px-6 text-sm font-semibold tracking-wide text-[#f7f3e8] shadow-[0_12px_25px_-16px_#0f2730] hover:bg-[#1f4554]"
            >
              <Link href="/app" className="flex items-center gap-2" suppressHydrationWarning>
                Enter Studio
                <Sparkles className="h-4 w-4" />
              </Link>
            </Button>
          </div>

          <button
            className="rounded-md p-2 text-[#2e3d46] md:hidden"
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? (
              <X className="w-6 h-6" />
            ) : (
              <Menu className="w-6 h-6" />
            )}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="border-t border-[#b79f7a55] py-4 md:hidden">
            <div className="flex flex-col gap-4">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="px-2 text-sm font-medium tracking-wide text-[#2e3d46] transition-colors hover:text-[#9f5a2d]"
                  onClick={() => setMobileMenuOpen(false)}
                  suppressHydrationWarning
                >
                  {link.label}
                </Link>
              ))}
              <Button
                asChild
                className="mt-2 h-11 rounded-full border border-[#1f45547a] bg-[#234d5e] text-[#f7f3e8] hover:bg-[#1f4554]"
              >
                <Link href="/app" onClick={() => setMobileMenuOpen(false)} suppressHydrationWarning>
                  Enter Studio
                </Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
