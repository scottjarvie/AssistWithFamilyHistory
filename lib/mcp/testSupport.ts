/**
 * Test-only helpers for the Family History MCP grant model.
 *
 * These exist so a suite can put a real, approved connection in the database
 * instead of faking the authorizer. Nothing in the product imports this file.
 */
import { FAMILY_HISTORY_SCOPES, type FamilyHistoryScope } from "./catalog";
import type { GrantBoundary } from "./authorize";

export type SeedGrantOptions = {
  vaultOwnerId: string;
  clientId?: string;
  issuer?: string;
  scopes?: FamilyHistoryScope[];
  boundary?: GrantBoundary;
  status?: "pending" | "active" | "revoked" | "expired" | "denied";
  expiresAt?: number | null;
  label?: string;
  /** What the connecting software called itself. Acceptance fixtures mark this. */
  observedClientName?: string;
};

type RunnableTest = {
  run<T>(handler: (ctx: { db: { insert(table: string, value: unknown): Promise<unknown> } }) => Promise<T>): Promise<T>;
};

/** Insert one grant row and return its id as a string. */
export async function seedGrant(t: RunnableTest, options: SeedGrantOptions): Promise<string> {
  const now = Date.now();
  const status = options.status ?? "active";
  const expiresAt =
    options.expiresAt === null
      ? undefined
      : (options.expiresAt ?? now + 30 * 24 * 60 * 60 * 1000);
  const id = await t.run(async (ctx) =>
    ctx.db.insert("mcpGrants", {
      vaultOwnerId: options.vaultOwnerId,
      clientId: options.clientId ?? "synthetic-mcp-client",
      issuer: options.issuer ?? "https://identity.example.test",
      label: options.label ?? "Synthetic test connection",
      observedClientName: options.observedClientName ?? "synthetic-test-client",
      clientProvenance: "manual" as const,
      scopes: options.scopes ?? [...FAMILY_HISTORY_SCOPES],
      boundary: options.boundary ?? { kind: "whole_workspace" as const },
      status,
      requestedAt: now,
      consentedAt: status === "active" ? now : undefined,
      issuedAt: status === "active" ? now : undefined,
      expiresAt,
      useCount: 0,
      updatedAt: now,
    }),
  );
  return String(id);
}
