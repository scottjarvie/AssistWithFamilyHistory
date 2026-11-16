import { PaginatedPlaces } from "@/components/vault/PaginatedPlaces";
import { loadPlaces } from "./actions";

import type { Metadata } from "next";
import { VaultStateCard } from "@/components/vault/VaultStateCard";
import { createPageMetadata } from "@/lib/seo";
import {
  getConvexRuntimeIssue,
  getConvexUnavailableState,
  isConvexConfigured,
} from "@/lib/convex/server";
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

  const { vaultOwnerId } = await getVaultAccessContext();
  let places;

  try {
    places = await loadPlaces({expectedOwner:vaultOwnerId,cursor:null,search:params.q||undefined});
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);

    return (
      <div className="p-6 sm:p-8">
        <VaultStateCard title={issue.title} description={issue.description} />
      </div>
    );
  }

  return <PaginatedPlaces key={`${vaultOwnerId}:${params.q}`} initial={places} query={params.q} vaultOwnerId={vaultOwnerId} preferenceKey={`awf.collection.places.${vaultOwnerId}`} />;
}
