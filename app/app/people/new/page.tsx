import type { Metadata } from "next";
import { ArrowLeft, UsersRound } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { SafeLink } from "@/components/layout/SafeLink";
import { PrivateFamilyStart } from "@/components/vault/PrivateFamilyStart";
import { VaultStateCard } from "@/components/vault/VaultStateCard";
import { Button } from "@/components/ui/button";
import { createPageMetadata } from "@/lib/seo";
import { getAuthedConvexClient, getConvexRuntimeIssue, getConvexUnavailableState, isConvexConfigured } from "@/lib/convex/server";
import { getVaultAccessContext } from "@/lib/vault/server";

export const metadata: Metadata = createPageMetadata({
  title: "Start your private family workspace",
  description: "Begin privately with two people and one known relationship.",
  path: "/app/people/new",
});

export const dynamic = "force-dynamic";

export default async function NewPeoplePage() {
  if (!isConvexConfigured()) {
    const issue = getConvexUnavailableState("Private first start", "Saving people and relationships needs the canonical private vault.");
    return <div className="p-6 sm:p-8"><VaultStateCard title={issue.title} description={issue.description} /></div>;
  }

  const { vaultOwnerId } = await getVaultAccessContext();
  const client = await getAuthedConvexClient();
  let firstStartEligible = false;
  try {
    const summary = await client.action(api.vaultReads.getDashboardSummary, { vaultOwnerId });
    firstStartEligible = summary.firstStartEligible;
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);
    return <div className="p-6 sm:p-8"><VaultStateCard title={issue.title} description={issue.description} /></div>;
  }

  if (!firstStartEligible) {
    return (
      <div className="mx-auto max-w-3xl p-4 sm:p-8">
        <section className="border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
          <UsersRound className="h-10 w-10 text-[#234d5e]" />
          <h1 className="mt-5 font-[family-name:var(--font-cormorant-garamond)] text-4xl font-semibold text-stone-900">Your workspace has already begun.</h1>
          <p className="mt-3 max-w-2xl leading-7 text-stone-600">This two-person guide is only for a genuinely empty private workspace. Continue from People so existing records, evidence, and relationships stay together.</p>
          <Button asChild className="mt-6 min-h-11 bg-[#234d5e] hover:bg-[#173c49]"><SafeLink href="/app/people">Open People</SafeLink></Button>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-4 pb-12 sm:p-8">
      <SafeLink href="/app" className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-stone-600 hover:text-stone-900"><ArrowLeft className="h-4 w-4" /> Back to workspace</SafeLink>
      <header className="mb-8 max-w-4xl">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#9f5a2d]">Private first start</p>
        <h1 className="mt-3 font-[family-name:var(--font-cormorant-garamond)] text-5xl font-semibold leading-[0.95] text-stone-900 sm:text-6xl">Begin with two people who belong together.</h1>
        <p className="mt-5 max-w-3xl text-base leading-8 text-stone-600 sm:text-lg">One person and one known relationship are enough to make the workspace useful. You stay in control of what counts as evidence, what stays private, and whether your AI receives a handoff.</p>
      </header>
      <PrivateFamilyStart />
    </div>
  );
}
