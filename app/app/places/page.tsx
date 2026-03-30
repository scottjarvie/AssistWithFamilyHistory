import Link from "next/link";
import { MapPinned, Search } from "lucide-react";
import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { VaultStateCard } from "@/components/vault/VaultStateCard";
import { createPageMetadata } from "@/lib/seo";
import {
  getConvexClient,
  getConvexRuntimeIssue,
  getConvexUnavailableState,
  isConvexConfigured,
} from "@/lib/convex/server";
import { api } from "@/convex/_generated/api";
import { getVaultAccessContext } from "@/lib/vault/server";

export const metadata: Metadata = createPageMetadata({
  title: "Places",
  description: "Browse the place graph behind your ancestors’ stories.",
  path: "/app/places",
});

export const dynamic = "force-dynamic";

export default async function PlacesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;

  if (!isConvexConfigured()) {
    const issue = getConvexUnavailableState(
      "Places",
      "The place explorer needs the canonical place graph."
    );
    return (
      <div className="p-6 sm:p-8">
        <VaultStateCard title={issue.title} description={issue.description} />
      </div>
    );
  }

  const client = getConvexClient();
  const { vaultOwnerId } = await getVaultAccessContext();
  let places;

  try {
    places = await client.query(api.vault.getPlacesExplorer, {
      vaultOwnerId,
      search: params.q || undefined,
    });
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);

    return (
      <div className="p-6 sm:p-8">
        <VaultStateCard title={issue.title} description={issue.description} />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-8">
        <Badge variant="secondary" className="mb-3">Place-centric context</Badge>
        <h1 className="text-3xl font-bold text-stone-900 sm:text-4xl">Places</h1>
        <p className="mt-2 max-w-2xl text-stone-500">
          Explore the locations that shaped migration, worship, residence, marriage, and memory.
        </p>
      </div>

      <form className="mb-6 rounded-[1.75rem] border border-stone-200 bg-white p-4 shadow-sm">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <Input name="q" defaultValue={params.q} placeholder="Search for a town, county, state, parish, or country" className="pl-9" />
        </div>
      </form>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {places.map((place) => (
          <Link key={String(place._id)} href={`/app/places/${place._id}`}>
            <Card className="h-full border-stone-200 bg-white shadow-sm transition hover:border-amber-300 hover:shadow-md">
              <CardHeader>
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                  <MapPinned className="h-5 w-5" />
                </div>
                <CardTitle>{place.fullName}</CardTitle>
                <CardDescription>{place.type}</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-2xl bg-stone-50 px-3 py-3">
                  <p className="text-stone-500">Events</p>
                  <p className="mt-1 font-semibold text-stone-900">{place.stats.events}</p>
                </div>
                <div className="rounded-2xl bg-stone-50 px-3 py-3">
                  <p className="text-stone-500">Citations</p>
                  <p className="mt-1 font-semibold text-stone-900">{place.stats.citations}</p>
                </div>
                <div className="rounded-2xl bg-stone-50 px-3 py-3">
                  <p className="text-stone-500">Media</p>
                  <p className="mt-1 font-semibold text-stone-900">{place.stats.media}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
