/** Durable grant choices. This module is shared by discovery, calls and settings. */
import { FAMILY_HISTORY_SCOPES, type FamilyHistoryScope } from "./catalog";

// Frozen 2026-10-23 baseline. NEVER add future scopes here: legacy full grants
// must inherit future catalog additions, while partial grants stay exactly chosen.
export const LEGACY_FULL_SCOPE_BASELINE = [
  "family_history:context:read",
  "family_history:evidence:read",
  "family_history:evidence:write",
  "family_history:research:write",
  "family_history:story:draft",
  "family_history:queue:read",
  "family_history:queue:work",
] as const;

export type ScopeChoice = "full" | "chosen";
export type GrantChoices = {
  scopes: readonly string[];
  boundary?: { kind: string; personIds?: string[]; queueItemIds?: string[] };
  scopeChoice?: ScopeChoice;
  withheldScopes?: readonly string[];
  expiryChoice?: "none" | "chosen";
  expiresAt?: number;
  requestedAt?: number;
  issuedAt?: number;
  consentedAt?: number;
  consentSnapshot?: string;
};

export function effectiveScopeChoice(grant: Pick<GrantChoices, "scopes" | "scopeChoice">): ScopeChoice {
  return grant.scopeChoice ?? (LEGACY_FULL_SCOPE_BASELINE.every((scope) => grant.scopes.includes(scope)) ? "full" : "chosen");
}

/** Legacy held lists become a frozen removed list: new powers still arrive. */
export function effectiveWithheldScopes(grant: GrantChoices): string[] {
  if (grant.withheldScopes !== undefined) return [...grant.withheldScopes];
  if (effectiveScopeChoice(grant) === "full" || untouchedAutomaticGrant(grant)) return [];
  return LEGACY_FULL_SCOPE_BASELINE.filter((scope) => !grant.scopes.includes(scope));
}

export function effectiveScopes(grant: GrantChoices): FamilyHistoryScope[] {
  const withheld = new Set(effectiveWithheldScopes(grant));
  return FAMILY_HISTORY_SCOPES.filter((scope) => !withheld.has(scope));
}

/** Only a matching sign-in consent receipt demonstrates an automatic old term.
 * Dates without provenance (including settings approvals) remain enforceable.
 * First issuance must match creation: old renewals could overwrite earlier
 * settings consent, so renewal receipts alone are ambiguous and stay enforced.
 * updatedAt/lastUsedAt are intentionally irrelevant: activity can change them.
 * The receipt builder sampled shownAt separately from issuedAt. A millisecond
 * mismatch is ambiguous, so keep its term enforced rather than infer consent
 * from nearby timestamps (including possible prior renewals).
 */
export function hasAutomaticLegacyExpiry(grant: Omit<GrantChoices, "scopes">): boolean {
  if (grant.expiryChoice || grant.expiresAt === undefined || grant.issuedAt === undefined || !grant.consentSnapshot) return false;
  try {
    const receipt = JSON.parse(grant.consentSnapshot);
    return receipt.approvedBy === "sign_in"
      && receipt.expiresAt === grant.expiresAt
      && receipt.shownAt === grant.issuedAt
      && grant.requestedAt === grant.issuedAt
      && grant.consentedAt === grant.issuedAt
      && grant.expiresAt === grant.issuedAt + 90 * 86_400_000;
  } catch {
    return false;
  }
}

export function effectiveExpiry(grant: Omit<GrantChoices, "scopes">): number | undefined {
  if (grant.expiryChoice === "none" || hasAutomaticLegacyExpiry(grant)) return undefined;
  return grant.expiresAt;
}

export function chosenExpiry(expiresInDays: number | undefined, now: number): number | undefined {
  if (expiresInDays === undefined) return undefined;
  if (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 365) {
    throw new Error("Choose a whole number of days from 1 to 365, or no end date");
  }
  return now + expiresInDays * 86_400_000;
}

/** Only a matching original receipt proves this was an untouched old default.
 * Missing/ambiguous provenance and any explicit choice remain enforceable. */
export function untouchedAutomaticGrant(grant: GrantChoices): boolean {
  if (grant.scopeChoice || grant.expiryChoice || grant.withheldScopes || !grant.consentSnapshot) return false;
  try {
    const receipt = JSON.parse(grant.consentSnapshot);
    const scopes = Array.isArray(receipt.scopes) ? receipt.scopes.map((s: string | { scope: string }) => typeof s === "string" ? s : s.scope) : null;
    return receipt.approvedBy === "sign_in" && receipt.shownAt === grant.issuedAt
      && grant.requestedAt === grant.issuedAt && grant.consentedAt === grant.issuedAt
      && scopes !== null && JSON.stringify([...scopes].sort()) === JSON.stringify([...grant.scopes].sort())
      && (!grant.boundary || (receipt.boundary?.kind === grant.boundary.kind
        && (receipt.boundary.personCount ?? 0) === (grant.boundary.personIds?.length ?? 0)
        && (receipt.boundary.queueItemCount ?? 0) === (grant.boundary.queueItemIds?.length ?? 0)))
      && (grant.expiresAt === undefined || hasAutomaticLegacyExpiry(grant));
  } catch { return false; }
}
