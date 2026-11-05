/** Local-only visual harness. These invented records never enter a backend. */
import { notFound } from "next/navigation";
import { DashboardView, type DashboardSummary } from "@/components/vault/DashboardView";
import { PeopleExplorerView, type PeopleExplorerRow } from "@/components/vault/PeopleExplorerView";
import { AppSidebar, AppMobileNav } from "@/components/layout/AppSidebar";
import { AppTopBar } from "@/components/layout/AppTopBar";

export const dynamic = "force-dynamic";
export const metadata = { title: "Synthetic design preview", robots: { index: false, follow: false } };
const people = [
  ["Eleanor Finch", 1842, 1913, "in_progress", 12, 3],
  ["Samuel Finch", 1838, 1901, "thorough", 24, 0],
  ["Mabel Ashford", 1870, 1948, "basic", 7, 5],
  ["Arthur Bell", 1865, 1932, "not_started", 2, 8],
].map(([displayName, birth, death, researchStatus, sources, gaps], index) => ({
  _id: `synthetic-${index}`, routeId: `synthetic-${index}`, displayName, living: false,
  birth: { date: { year: birth } }, death: { date: { year: death } }, researchStatus,
  stats: { sources, imports: 2, memories: 3, documents: 2, stories: 1 },
  operations: { requiredMissingCount: gaps }, latestImport: { importedAt: 1793808000000 },
})) as unknown as PeopleExplorerRow[];
const summary = {
  firstStartEligible: false,
  counts: { people: 4, places: 3, stories: 4, imports: 8, documents: 8, openTasks: 6, provisionalRelatives: 0 },
  recentPeople: people, recentImports: [], operationsHighlights: people,
} as unknown as DashboardSummary;

export default async function DesignPreview({ searchParams }: { searchParams: Promise<{ page?: string; theme?: string }> }) {
  if (process.env.NODE_ENV !== "development" || process.env.VERCEL || process.env.CI) notFound();
  const { page, theme } = await searchParams;
  return <div className={theme === "dark" ? "dark" : ""}>
    <div className="min-h-screen bg-background text-foreground">
      <AppSidebar accountMode="local" vaultOwnerId="synthetic-design-only" clerkEnabled={false} />
      <AppMobileNav accountMode="local" vaultOwnerId="synthetic-design-only" clerkEnabled={false} />
      <main className="min-h-screen md:ml-64">
        <AppTopBar clerkEnabled={false} />
        <p className="border-b border-border bg-muted px-4 py-2 text-xs text-muted-foreground">Design preview · invented records · no backend connected</p>
        {page === "people" ? <PeopleExplorerView people={people} firstStartEligible={false} loadMoreHref={null} /> :
          <DashboardView summary={page === "empty" ? { ...summary, firstStartEligible: true, recentPeople: [], recentImports: [] } : summary} />}
      </main>
    </div>
  </div>;
}
