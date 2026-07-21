/**
 * /app/api/admin — the Admin / Operator API surface (Jarvie Shared Agent API model).
 *
 * Admin is a ROLE, not a tier: gated by isAdminUser (ADMIN_USER_IDS env allowlist).
 * Operators get key oversight with stale-key flags and suspend/revoke tooling.
 * (Cross-tenant oversight lands with multi-account admin; today this is the
 * operator view of the current vault's keys.)
 */
import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";
import { ApiKeyManager, type ApiKeyRow } from "@/components/api/ApiKeyManager";
import { VaultStateCard } from "@/components/vault/VaultStateCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  title: "Admin API",
  description: "Operator key management and oversight.",
  path: "/app/api/admin",
});

function NotAuthorized() {
  return (
    <div className="max-w-2xl p-6 sm:p-8">
      <Card className="border-stone-200">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-700" />
            <CardTitle>Operator access required</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="text-sm leading-6 text-stone-600">
          The Admin API is a control-plane surface limited to operators. Access is granted by adding
          your account id to the <code className="font-mono text-xs">ADMIN_USER_IDS</code> allowlist.
          If you should have operator access, set it in the deployment environment.
        </CardContent>
      </Card>
    </div>
  );
}

export default async function AdminApiPage() {
  if (!isConvexConfigured()) {
    const issue = getConvexUnavailableState("Admin API", "Key oversight needs the canonical vault backend.");
    return (
      <div className="p-6 sm:p-8">
        <VaultStateCard title={issue.title} description={issue.description} />
      </div>
    );
  }

  let keys: ApiKeyRow[] = [];
  let authorized = false;
  let runtimeIssue: { title: string; description: string } | null = null;
  try {
    const { vaultOwnerId, userId } = await getVaultAccessContext();
    if (isAdminUser(userId)) {
      authorized = true;
      const client = await getAuthedConvexClient();
      keys = (await client.action(api.apiKeys.listKeys, { vaultOwnerId })) as ApiKeyRow[];
    }
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);
    runtimeIssue = { title: issue.title, description: issue.description };
  }

  if (runtimeIssue) {
    return (
      <div className="p-6 sm:p-8">
        <VaultStateCard title={runtimeIssue.title} description={runtimeIssue.description} />
      </div>
    );
  }
  if (!authorized) {
    return <NotAuthorized />;
  }

  return (
    <div className="max-w-4xl p-4 sm:p-8">
      <header className="mb-8">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-6 w-6 text-amber-700" />
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl font-semibold text-stone-950">
            Admin API
          </h1>
        </div>
        <p className="mt-2 max-w-2xl text-stone-600">
          Operator console: review keys, flag stale credentials, and suspend or revoke access. Admin
          and security scopes require this operator role, separate from the normal key tiers.
        </p>
      </header>
      <ApiKeyManager initialKeys={keys} mode="admin" isAdmin />
    </div>
  );
}
