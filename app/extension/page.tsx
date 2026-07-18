import type { Metadata } from "next";
import {
  ArrowRight,
  CheckCircle2,
  Chrome,
  Clock,
  Download,
  FileJson,
  MousePointer,
  Shield,
  Upload,
} from "lucide-react";

import { Footer } from "@/components/layout/Footer";
import { MarketingNav } from "@/components/layout/MarketingNav";
import { SafeLink as Link } from "@/components/layout/SafeLink";
import { ResearchSpine } from "@/components/marketing/ResearchSpine";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Extension",
  description:
    "Install the FamilySearch capture extension and import capture packages into the Discover Their Stories research vault.",
  path: "/extension",
});

const captureFeatures = [
  {
    title: "User-initiated capture",
    description:
      "Open one person’s sources or memories page, confirm consent, and start the capture yourself.",
    icon: MousePointer,
  },
  {
    title: "Visible source detail",
    description:
      "The extension expands indexed information so the capture package can preserve useful fields and source context.",
    icon: CheckCircle2,
  },
  {
    title: "Portable capture package",
    description:
      "Download structured JSON with source text, memories, indexed facts, related people, places, and diagnostics.",
    icon: FileJson,
  },
  {
    title: "Respectful pacing",
    description:
      "Built-in delays keep capture deliberate and user-mediated. It is not an unattended crawler or bulk scraper.",
    icon: Shield,
  },
];

const captureSteps = [
  {
    title: "Open one person page",
    description:
      "Go to a FamilySearch person’s sources or memories page while signed in through your own browser session.",
    icon: Chrome,
  },
  {
    title: "Confirm and capture",
    description:
      "Open the extension, acknowledge the consent prompt, and start the capture while the page remains visible.",
    icon: MousePointer,
  },
  {
    title: "Keep the package",
    description:
      "Download the JSON file or copy it to your clipboard. You decide whether and when it leaves your device.",
    icon: Download,
  },
  {
    title: "Review the import",
    description:
      "Open Imports, preview the package, inspect identity matches and warnings, and only then merge accepted material into your vault.",
    icon: Upload,
  },
];

export default function ExtensionPage() {
  return (
    <div className="min-h-screen bg-[#f7f3e8] text-[#1d212a]">
      <MarketingNav />

      <main className="overflow-hidden pt-[4.5rem]">
        <section className="relative border-b border-[#d8c7a7] px-4 py-20 sm:px-6 md:py-28 lg:px-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,#ead8ba_0%,transparent_38%),radial-gradient(circle_at_86%_20%,#c9d9d2_0%,transparent_34%)] opacity-70" />
          <div className="relative mx-auto max-w-5xl text-center">
            <Badge className="mb-5 rounded-full border border-[#c57d3966] bg-[#fffaf2] px-4 py-1.5 text-[#9f5a2d] hover:bg-[#fffaf2]">
              <Chrome aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
              Chrome extension
            </Badge>
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-[#75694f]">
              The capture front door
            </p>
            <h1 className="mx-auto mt-4 max-w-4xl text-5xl font-semibold leading-[0.98] text-[#1d212a] sm:text-6xl md:text-7xl">
              Bring the evidence in before you tell the story.
            </h1>
            <p className="mx-auto mt-7 max-w-3xl text-lg leading-8 text-[#4f5c5b] md:text-xl">
              Capture FamilySearch sources and memories into a portable package,
              then review the import before it becomes part of your private
              research vault.
            </p>

            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="h-12 rounded-full bg-[#234d5e] px-7 text-[#f7f3e8] shadow-[0_16px_35px_-22px_#132b35] hover:bg-[#1f4554]"
              >
                <a
                  href="/extension-download/discover-their-stories-extension.zip"
                  download
                >
                  <Download aria-hidden="true" className="mr-2 h-5 w-5" />
                  Download extension
                </a>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-12 rounded-full border-[#9f5a2d66] bg-[#fffaf2aa] px-7 text-[#7a4525] hover:bg-[#fffaf2]"
              >
                <a href="#installation">View installation guide</a>
              </Button>
            </div>

            <p className="mt-5 text-sm text-[#6f664f]">
              Current manual release · Chrome, Edge, and Brave · Review our{" "}
              <Link href="/privacy" className="font-medium text-[#9f5a2d] underline-offset-4 hover:underline">
                Privacy Policy
              </Link>
            </p>
          </div>
        </section>

        <section
          aria-labelledby="research-spine-heading"
          className="border-b border-[#d8c7a7] bg-[#efe7d8] px-4 py-16 sm:px-6 lg:px-8"
        >
          <div className="mx-auto max-w-7xl">
            <div className="mb-9 max-w-3xl">
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#9f5a2d]">
                One research journey
              </p>
              <h2
                id="research-spine-heading"
                className="mt-3 text-4xl font-semibold text-[#1d212a] md:text-5xl"
              >
                Capture is the beginning, not the finished story.
              </h2>
              <p className="mt-4 text-base leading-7 text-[#56615d] md:text-lg">
                Discover Their Stories preserves the path from source material
                to reviewed writing. Each stage keeps the evidence and its
                uncertainty visible.
              </p>
            </div>
            <ResearchSpine activeStage="capture" />
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6 md:py-20 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto mb-10 max-w-2xl text-center">
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#9f5a2d]">
                What the extension does
              </p>
              <h2 className="mt-3 text-4xl font-semibold md:text-5xl">
                A deliberate handoff from browser to vault.
              </h2>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              {captureFeatures.map((feature) => (
                <Card
                  key={feature.title}
                  className="border-[#d8c7a7] bg-[#fffaf2] shadow-[0_20px_50px_-42px_#132b35]"
                >
                  <CardHeader>
                    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full border border-[#234d5e33] bg-[#234d5e0d] text-[#234d5e]">
                      <feature.icon aria-hidden="true" className="h-5 w-5" />
                    </div>
                    <CardTitle className="text-2xl">{feature.title}</CardTitle>
                    <CardDescription className="text-base leading-7 text-[#5f665f]">
                      {feature.description}
                    </CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-[#d8c7a7] bg-[#f1eadf] px-4 py-16 sm:px-6 md:py-20 lg:px-8">
          <div className="mx-auto max-w-5xl">
            <div className="mb-10 text-center">
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#9f5a2d]">
                Capture workflow
              </p>
              <h2 className="mt-3 text-4xl font-semibold md:text-5xl">
                Four visible, reviewable steps.
              </h2>
            </div>

            <ol className="space-y-4">
              {captureSteps.map((step, index) => (
                <li
                  key={step.title}
                  className="flex gap-4 rounded-2xl border border-[#d8c7a7] bg-[#fffaf2] p-5 sm:gap-6 sm:p-6"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#234d5e] font-mono text-sm text-[#f7f3e8]">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-xl font-semibold">{step.title}</h3>
                    <p className="mt-1.5 leading-7 text-[#5f665f]">
                      {step.description}
                    </p>
                  </div>
                  <step.icon
                    aria-hidden="true"
                    className="mt-2 hidden h-5 w-5 shrink-0 text-[#9f5a2d] sm:block"
                  />
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="installation" className="scroll-mt-24 px-4 py-16 sm:px-6 md:py-20 lg:px-8">
          <div className="mx-auto max-w-5xl">
            <div className="mb-10 text-center">
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#9f5a2d]">
                Installation
              </p>
              <h2 className="mt-3 text-4xl font-semibold md:text-5xl">
                Install the unpacked extension.
              </h2>
              <p className="mx-auto mt-4 max-w-2xl leading-7 text-[#5f665f]">
                The current release is installed manually in Chrome, Edge, or
                Brave. Keep the extracted folder after installation.
              </p>
            </div>

            <div className="rounded-3xl border border-[#d8c7a7] bg-[#fffaf2] p-6 shadow-[0_24px_60px_-48px_#132b35] sm:p-9">
              <ol className="space-y-9">
                <InstallationStep number="1" title="Download and extract">
                  <p>
                    Download the ZIP file and extract it to a folder you will
                    keep, such as your Documents folder.
                  </p>
                  <Button asChild variant="outline" size="sm" className="mt-4 border-[#9f5a2d66] text-[#7a4525]">
                    <a
                      href="/extension-download/discover-their-stories-extension.zip"
                      download
                    >
                      <Download aria-hidden="true" className="mr-2 h-4 w-4" />
                      Download ZIP
                    </a>
                  </Button>
                </InstallationStep>

                <InstallationStep number="2" title="Open browser extensions">
                  <p>Open the extensions management page in your browser.</p>
                  <code className="mt-3 block overflow-x-auto rounded-lg bg-[#132b35] px-4 py-3 font-mono text-sm text-[#fff6e5]">
                    chrome://extensions/
                  </code>
                </InstallationStep>

                <InstallationStep number="3" title="Enable Developer mode">
                  <p>
                    Turn on <strong>Developer mode</strong> in the extensions
                    page. This reveals the control for loading an unpacked
                    extension.
                  </p>
                </InstallationStep>

                <InstallationStep number="4" title="Load the extracted folder">
                  <p>
                    Choose <strong>Load unpacked</strong> and select the folder
                    you extracted. The current extension appears as Discover
                    Their Stories – FamilySearch Capture with an orange “T”
                    toolbar icon.
                  </p>
                </InstallationStep>
              </ol>
            </div>
          </div>
        </section>

        <section className="border-y border-[#d8c7a7] bg-[#efe7d8] px-4 py-16 sm:px-6 md:py-20 lg:px-8">
          <h2 className="sr-only">How capture stays deliberate</h2>
          <div className="mx-auto grid max-w-6xl gap-5 md:grid-cols-3">
            <DetailCard icon={Clock} title="Measured pacing">
              <li>Delays between visible capture actions</li>
              <li>A hard cap on source expansions</li>
              <li>One person page per standard capture</li>
            </DetailCard>
            <DetailCard icon={FileJson} title="Evidence preserved">
              <li>Source titles, citation text, and record links</li>
              <li>Indexed fields, related people, and places</li>
              <li>Memories, capture metadata, and diagnostics</li>
            </DetailCard>
            <DetailCard icon={Shield} title="Private by default">
              <li>Capture starts only after your visible consent</li>
              <li>You control the exported package</li>
              <li>Import review does not publish a family story</li>
            </DetailCard>
          </div>
        </section>

        <section className="bg-[#234d5e] px-4 py-16 text-[#f7f3e8] sm:px-6 md:py-20 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#e7c99f]">
              Ready when you are
            </p>
            <h2 className="mt-3 text-4xl font-semibold md:text-5xl">
              Capture one person. Review one package.
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-[#d9cdb5]">
              Keep the first step small and inspectable. Nothing is merged into
              the vault until you open the import review and confirm it.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-12 rounded-full bg-[#f7f3e8] px-7 text-[#234d5e] hover:bg-[#fffaf2]">
                <a
                  href="/extension-download/discover-their-stories-extension.zip"
                  download
                >
                  <Download aria-hidden="true" className="mr-2 h-5 w-5" />
                  Download extension
                </a>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-12 rounded-full border-[#f7f3e899] bg-transparent px-7 text-[#f7f3e8] hover:bg-[#f7f3e81a] hover:text-white"
              >
                <Link href="/app/imports">
                  Open Imports workspace
                  <ArrowRight aria-hidden="true" className="ml-2 h-5 w-5" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

function InstallationStep({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-4 sm:gap-6">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#c57d3980] bg-[#c57d3918] font-mono text-sm font-semibold text-[#9f5a2d]">
        {number}
      </span>
      <div className="min-w-0 flex-1 text-[#5f665f]">
        <h3 className="text-xl font-semibold text-[#1d212a]">{title}</h3>
        <div className="mt-2 leading-7">{children}</div>
      </div>
    </li>
  );
}

function DetailCard({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Clock;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-[#d8c7a7] bg-[#fffaf2] shadow-none">
      <CardHeader>
        <Icon aria-hidden="true" className="mb-2 h-7 w-7 text-[#234d5e]" />
        <CardTitle className="text-2xl">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-sm leading-6 text-[#5f665f]">
          {children}
        </ul>
      </CardContent>
    </Card>
  );
}
