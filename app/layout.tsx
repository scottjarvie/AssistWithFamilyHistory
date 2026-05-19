/**
 * Root Layout - Discover Their Stories
 * 
 * Purpose: Main application layout wrapping all pages
 * 
 * Key Elements:
 * - Font configuration (Instrument Sans, Cormorant Garamond, IBM Plex Mono)
 * - Global CSS imports
 * - Toaster for notifications
 * - HTML lang and body setup
 * 
 * Dependencies:
 * - next/font/google (custom brand fonts)
 * - sonner (toast notifications)
 * - ./globals.css (global styles)
 * 
 * Last Updated: Initial setup
 */

import type { Metadata } from "next";
import { Cormorant_Garamond, IBM_Plex_Mono, Instrument_Sans } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "@/components/ui/sonner";
import { getClerkPublishableKey } from "@/lib/clerk/config";
import { defaultMetadata } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
});

const cormorantGaramond = Cormorant_Garamond({
  variable: "--font-cormorant-garamond",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  ...defaultMetadata,
  metadataBase: new URL(SITE_URL),
  keywords: ["family history", "genealogy", "AI", "storytelling", "FamilySearch", "ancestors"],
  alternates: {
    canonical: "/",
  },
};

const clerkPublishableKey = getClerkPublishableKey();

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${instrumentSans.variable} ${cormorantGaramond.variable} ${ibmPlexMono.variable} antialiased`}
      >
        {clerkPublishableKey ? (
          <ClerkProvider publishableKey={clerkPublishableKey}>{children}</ClerkProvider>
        ) : (
          children
        )}
        <Toaster />
      </body>
    </html>
  );
}
