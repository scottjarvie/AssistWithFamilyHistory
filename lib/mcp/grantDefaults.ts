/** Durable grant choices. This module is shared by discovery, calls and settings. */
import { FAMILY_HISTORY_SCOPES, clampToScopeCeiling, type FamilyHistoryScope } from "./catalog";

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
  scopeChoice?: ScopeChoice;
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

export function effectiveScopes(grant: Pick<GrantChoices, "scopes" | "scopeChoice">): FamilyHistoryScope[] {
  return effectiveScopeChoice(grant) === "full" ? [...FAMILY_HISTORY_SCOPES] : clampToScopeCeiling(grant.scopes);
}

/** Only a matching sign-in consent receipt demonstrates an automatic old term.
 * Dates without provenance (including settings approvals) remain enforceable.
 * First issuance must match creation: old renewals could overwrite earlier
 * settings consent, so renewal receipts alone are ambiguous and stay enforced.
 * updatedAt/lastUsedAt are intentionally irrelevant: activity can change them.
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
