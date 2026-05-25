import type { Metadata } from "next";
import { SafeLink } from "@/components/layout/SafeLink";
import {
  ArrowRight,
  Beaker,
  CheckCircle2,
  EyeOff,
  Flag,
  LockKeyhole,
  ShieldAlert,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  experimentDefinitions,
  getVisibleExperiments,
  isExperimentLaunchAvailable,
  type ExperimentDefinition,
  type ExperimentPrivacyRisk,
} from "@/lib/experiments/registry";
import { createPageMetadata } from "@/lib/seo";
import { cn } from "@/lib/utils";

export const metadata: Metadata = createPageMetadata({
  title: "Experimental Tools",
  description: "Review beta and experimental genealogy tools without mixing prototypes into the main workflow.",
  path: "/app/experiments",
});

const privacyTone: Record<
  ExperimentPrivacyRisk,
  {
    label: string;
    className: string;
    Icon: LucideIcon;
  }
> = {
  low: {
    label: "Low privacy risk",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    Icon: CheckCircle2,
  },
  medium: {
    label: "Privacy review",
    className: "border-amber-200 bg-amber-50 text-amber-800",
    Icon: ShieldAlert,
  },
  high: {
    label: "High privacy risk",
    className: "border-rose-200 bg-rose-50 text-rose-800",
    Icon: LockKeyhole,
  },
};

function ExperimentCard({ experiment }: { experiment: ExperimentDefinition }) {
  const launchAvailable = isExperimentLaunchAvailable(experiment);
  const PrivacyIcon = privacyTone[experiment.privacyRisk].Icon;

  return (
    <Card className="border-stone-200 bg-white shadow-sm">
      <CardHeader className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant={experiment.visibility === "public" ? "default" : "secondary"}>
              {experiment.visibility}
            </Badge>
            <Badge variant="outline">{experiment.maturity}</Badge>
          </div>
          <Badge
            variant="outline"
            className={cn("gap-1.5 border", privacyTone[experiment.privacyRisk].className)}
          >
            <PrivacyIcon className="h-3.5 w-3.5" />
            {privacyTone[experiment.privacyRisk].label}
          </Badge>
        </div>
        <div>
          <CardTitle className="text-xl text-stone-950">{experiment.title}</CardTitle>
          <CardDescription className="mt-2 text-sm leading-6">{experiment.summary}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm leading-6 text-stone-600">{experiment.purpose}</p>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="border border-stone-200 bg-stone-50 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Required data</p>
            <ul className="mt-3 space-y-2 text-sm text-stone-700">
              {experiment.requiredData.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-stone-400" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="border border-stone-200 bg-white px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Review signals</p>
            <ul className="mt-3 space-y-2 text-sm text-stone-700">
              {experiment.reviewSignals.map((item) => (
                <li key={item} className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-emerald-700" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border border-stone-200 bg-stone-950 px-4 py-4 text-white">
          <div className="flex items-center gap-2">
            <LockKeyhole className="h-4 w-4 text-amber-300" />
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-300">Privacy boundary</p>
          </div>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-stone-200">
            {experiment.privacyNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-4">
          <div className="flex flex-wrap gap-2">
            {experiment.relatedIssues.map((issue) => (
              <Badge key={issue} variant="outline">
                {issue}
              </Badge>
            ))}
          </div>
          {launchAvailable && experiment.launch.href ? (
            <Button asChild className="bg-amber-700 hover:bg-amber-800">
              <SafeLink href={experiment.launch.href}>
                Open
                <ArrowRight className="ml-2 h-4 w-4" />
              </SafeLink>
            </Button>
          ) : (
            <Badge variant="secondary" className="gap-1.5">
              {experiment.launch.state === "flagged" ? (
                <Flag className="h-3.5 w-3.5" />
              ) : (
                <EyeOff className="h-3.5 w-3.5" />
              )}
              {experiment.launch.state}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function ExperimentalToolsPage() {
  const visibleExperiments = getVisibleExperiments();
  const hiddenCount = experimentDefinitions.length - visibleExperiments.length;
  const activeCount = visibleExperiments.filter((experiment) => isExperimentLaunchAvailable(experiment)).length;
  const privacyReviewCount = visibleExperiments.filter((experiment) => experiment.privacyRisk !== "low").length;

  return (
    <div className="p-4 sm:p-8">
      <section className="border border-stone-200 bg-white px-6 py-7 shadow-sm">
        <div className="grid gap-6 lg:grid-cols-[1fr_340px] lg:items-end">
          <div>
            <Badge variant="secondary" className="mb-4 gap-1.5">
              <Beaker className="h-3.5 w-3.5" />
              Experimental tools lab
            </Badge>
            <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl font-semibold leading-tight text-stone-950 sm:text-5xl">
              Try prototypes without turning them into promises.
            </h1>
            <p className="mt-3 max-w-3xl text-stone-600">
              Beta and planned genealogy tools live here with maturity, data, privacy, and launch-state labels before they graduate into the core workflow.
            </p>
          </div>
          <div className="grid grid-cols-3 border border-stone-200">
            {[
              ["Visible", visibleExperiments.length],
              ["Open", activeCount],
              ["Review", privacyReviewCount],
            ].map(([label, value]) => (
              <div key={label} className="border-r border-stone-200 px-4 py-4 last:border-r-0">
                <p className="text-xs uppercase tracking-[0.18em] text-stone-400">{label}</p>
                <p className="mt-2 text-2xl font-semibold text-stone-950">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-5 xl:grid-cols-2">
        {visibleExperiments.map((experiment) => (
          <ExperimentCard key={experiment.id} experiment={experiment} />
        ))}
      </section>

      <section className="mt-6 border border-dashed border-stone-300 bg-stone-100 px-5 py-4 text-sm text-stone-600">
        <div className="flex flex-wrap items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-700" />
          <span>{hiddenCount} hidden experiments require an explicit feature flag before they appear here.</span>
        </div>
      </section>
    </div>
  );
}
