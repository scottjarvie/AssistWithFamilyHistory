/**
 * /app/api — the User API Center (Jarvie Shared Agent API model).
 *
 * Mint scoped keys for your AI agent, see the first-success path, and manage
 * (rotate/revoke/suspend) your keys. The Admin/Operator surface is /app/api/admin.
 */
import type { Metadata } from "next";
import { ApiKeyManager, type ApiKeyRow } from "@/components/api/ApiKeyManager";
import { VaultStateCard } from "@/components/vault/VaultStateCard";
import { api } from "@/convex/_generated/api";
import {
  getAuthedConvexClient,
  getConvexRuntimeIssue,
  getConvexUnavailableState,
  isConvexConfigured,
} from "@/lib/convex/server";
import { getVaultAccessContext } from "@/lib/vault/server";
import { isAdminUser } from "@/lib/auth/admin";
import { createPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = createPageMetadata({
  title: "API Center",
  description: "Create and manage API keys so your AI agent can work in your family-history vault.",
  path: "/app/api",
});

export default async function ApiCenterPage() {
  if (!isConvexConfigured()) {
    const issue = getConvexUnavailableState("API Center", "API keys need the canonical vault backend.");
    return (
      <div className="p-6 sm:p-8">
        <VaultStateCard title={issue.title} description={issue.description} />
      </div>
    );
  }

  let keys: ApiKeyRow[] = [];
  let admin = false;
  try {
    const { vaultOwnerId, userId } = await getVaultAccessContext();
    admin = isAdminUser(userId);
    const client = await getAuthedConvexClient();
    keys = (await client.query(api.apiKeys.listKeys, { vaultOwnerId })) as ApiKeyRow[];
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);
    return (
      <div className="p-6 sm:p-8">
        <VaultStateCard title={issue.title} description={issue.description} />
      </div>
    );
  }

  return (
    <div className="max-w-4xl p-4 sm:p-8">
      <header className="mb-8">
        <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl font-semibold text-stone-950">
          API Center
        </h1>
        <p className="mt-2 max-w-2xl text-stone-600">
          Create a key, point your AI agent at it, and it can help gather, organize, and tell your
          family&apos;s story — scoped to exactly what you allow. New keys default to private,
          review-first writes; living-person and unreviewed data stay protected.
        </p>
      </header>
      <ApiKeyManager initialKeys={keys} mode="user" isAdmin={admin} />
    </div>
  );
}
