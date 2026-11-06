import { PlaceCollectionView } from "@/components/vault/PlaceCollectionView";
import { projectPlaceRow } from "@/lib/vault/collectionRows";
import type { Metadata } from "next";
import { VaultStateCard } from "@/components/vault/VaultStateCard";
import { createPageMetadata } from "@/lib/seo";
import {
  getAuthedConvexClient,
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

  const client = await getAuthedConvexClient();
  const { vaultOwnerId } = await getVaultAccessContext();
  let places;

  try {
    places = await client.action(api.vaultReads.getPlacesExplorer, {
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

  return <PlaceCollectionView places={places.map(projectPlaceRow)} query={params.q} preferenceKey={`awf.collection.places.${vaultOwnerId}`} />;
}
