import type { ActionCtx, MutationCtx } from "./_generated/server";
import { matchesVaultOwner, normalizeVaultOwnerId } from "./vaultCore";

export type TrustBoundaryMode = "shadow" | "enforce";

export type TrustBoundaryDenialReason =
  | "missing_identity"
  | "owner_mismatch"
  | "guest_source_unverified"
  | "reference_owner_mismatch"
  | "publish_gate_failed"
  | "published_edit_requires_review"
  | "direct_publish_bypass";

export type TrustBoundaryShadowEntry = {
  functionName: string;
  caller: string;
  callerKind: "anonymous" | "authenticated";
  reason: TrustBoundaryDenialReason;
  timestamp: number;
};

export type TenantAccessDecision = {
  allowed: boolean;
  mode: TrustBoundaryMode;
  owner: string;
  caller: string;
  callerKind: "anonymous" | "authenticated";
  reason?: "missing_identity" | "owner_mismatch";
};

type AuthContext = Pick<MutationCtx, "auth"> | Pick<ActionCtx, "auth">;

export function getTrustBoundaryMode(value = process.env.TRUST_BOUNDARY_MODE): TrustBoundaryMode {
  return value === "enforce" ? "enforce" : "shadow";
}

export function decideTenantAccess(input: {
  identitySubject?: string | null;
  suppliedOwner?: string | null;
  mode?: TrustBoundaryMode;
}): TenantAccessDecision {
  const mode = input.mode ?? getTrustBoundaryMode();
  const owner = normalizeVaultOwnerId(input.suppliedOwner);
  const identitySubject = input.identitySubject?.trim() || null;

  if (!identitySubject) {
    return {
      allowed: false,
      mode,
      owner,
      caller: "<anonymous>",
      callerKind: "anonymous",
      reason: "missing_identity",
    };
  }

  if (normalizeVaultOwnerId(identitySubject) !== owner) {
    return {
      allowed: false,
      mode,
      owner,
      caller: identitySubject,
      callerKind: "authenticated",
      reason: "owner_mismatch",
    };
  }

  return {
    allowed: true,
    mode,
    owner: normalizeVaultOwnerId(identitySubject),
    caller: identitySubject,
    callerKind: "authenticated",
  };
}

function shadowEntry(
  functionName: string,
  caller: string,
  callerKind: "anonymous" | "authenticated",
  reason: TrustBoundaryDenialReason,
): TrustBoundaryShadowEntry {
  return { functionName, caller, callerKind, reason, timestamp: Date.now() };
}

function throwDenied(reason: TrustBoundaryDenialReason): never {
  throw new Error(`Trust boundary denied: ${reason}`);
}

async function authorizeTenant(
  ctx: AuthContext,
  params: {
    functionName: string;
    suppliedOwner?: string | null;
    persistShadowEntry: (entry: TrustBoundaryShadowEntry) => Promise<unknown>;
  },
): Promise<TenantAccessDecision> {
  const identity = await ctx.auth.getUserIdentity();
  const decision = decideTenantAccess({
    identitySubject: identity?.subject,
    suppliedOwner: params.suppliedOwner,
  });

  if (decision.allowed) return decision;
  if (decision.mode === "enforce") throwDenied(decision.reason!);

  await params.persistShadowEntry(
    shadowEntry(
      params.functionName,
      decision.caller,
      decision.callerKind,
      decision.reason!,
    ),
  );
  return decision;
}

export function authorizeTenantMutation(
  ctx: MutationCtx,
  functionName: string,
  suppliedOwner?: string | null,
): Promise<TenantAccessDecision> {
  return authorizeTenant(ctx, {
    functionName,
    suppliedOwner,
    persistShadowEntry: (entry) => ctx.db.insert("trustBoundaryShadowLog", entry),
  });
}

export function authorizeTenantAction(
  ctx: Pick<ActionCtx, "auth">,
  functionName: string,
  suppliedOwner: string | null | undefined,
  persistShadowEntry: (entry: TrustBoundaryShadowEntry) => Promise<unknown>,
): Promise<TenantAccessDecision> {
  return authorizeTenant(ctx, { functionName, suppliedOwner, persistShadowEntry });
}

export async function handlePolicyViolationMutation(
  ctx: MutationCtx,
  functionName: string,
  reason: Exclude<TrustBoundaryDenialReason, "missing_identity" | "owner_mismatch">,
): Promise<void> {
  if (getTrustBoundaryMode() === "enforce") throwDenied(reason);
  const identity = await ctx.auth.getUserIdentity();
  await ctx.db.insert(
    "trustBoundaryShadowLog",
    shadowEntry(
      functionName,
      identity?.subject?.trim() || "<anonymous>",
      identity?.subject ? "authenticated" : "anonymous",
      reason,
    ),
  );
}

/**
 * Validate a record reference after the caller guard has run. Missing records
 * remain ordinary not-found errors in both modes. A real cross-tenant record is
 * a trust-boundary denial: shadow mode records and preserves legacy behavior;
 * enforce mode throws before the reference can be stored or dereferenced.
 */
export async function authorizeOwnedReferenceMutation<
  T extends { vaultOwnerId?: string },
>(
  ctx: MutationCtx,
  functionName: string,
  vaultOwnerId: string,
  row: T | null,
  label: string,
): Promise<T> {
  if (!row) throw new Error(`${label} not found`);
  if (!matchesVaultOwner(row.vaultOwnerId, vaultOwnerId)) {
    await handlePolicyViolationMutation(
      ctx,
      functionName,
      "reference_owner_mismatch",
    );
  }
  return row;
}

export function requireTrustBoundarySuperAdmin(identitySubject?: string | null): void {
  const admins = (process.env.TRUST_BOUNDARY_SUPER_ADMIN_IDS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (!identitySubject || !admins.includes(identitySubject)) {
    throw new Error("Trust boundary summary requires a configured super-admin");
  }
}
