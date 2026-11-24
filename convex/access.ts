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

function logShadowMutationDenial(entry: TrustBoundaryShadowEntry): void {
  // A mutation that refuses the request rolls back its database writes,
  // including any log row. Emit this denial through Convex function logs.
  console.warn("Trust boundary shadow denial", entry);
}

async function authorizeTenant(
  ctx: AuthContext,
  params: {
    functionName: string;
    suppliedOwner?: string | null;
    recordShadowEntry: (entry: TrustBoundaryShadowEntry) => void | Promise<unknown>;
  },
): Promise<TenantAccessDecision> {
  const identity = await ctx.auth.getUserIdentity();
  const decision = decideTenantAccess({
    identitySubject: identity?.subject,
    suppliedOwner: params.suppliedOwner,
  });

  if (decision.allowed) return decision;
  const reason = decision.reason ?? "missing_identity";
  if (decision.mode === "shadow") {
    await params.recordShadowEntry(
      shadowEntry(params.functionName, decision.caller, decision.callerKind, reason),
    );
  }
  throwDenied(reason);
}

export function authorizeTenantMutation(
  ctx: MutationCtx,
  functionName: string,
  suppliedOwner?: string | null,
): Promise<TenantAccessDecision> {
  return authorizeTenant(ctx, {
    functionName,
    suppliedOwner,
    recordShadowEntry: logShadowMutationDenial,
  });
}

export function authorizeTenantAction(
  ctx: Pick<ActionCtx, "auth">,
  functionName: string,
  suppliedOwner: string | null | undefined,
  recordShadowEntry: (entry: TrustBoundaryShadowEntry) => Promise<unknown>,
): Promise<TenantAccessDecision> {
  return authorizeTenant(ctx, { functionName, suppliedOwner, recordShadowEntry });
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
 * remain ordinary not-found errors in both modes. Refuse foreign references
 * before they can be stored or dereferenced, including in shadow mode.
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
    const reason = "reference_owner_mismatch";
    if (getTrustBoundaryMode() === "shadow") {
      const identity = await ctx.auth.getUserIdentity();
      const caller = identity?.subject?.trim();
      logShadowMutationDenial(
        shadowEntry(functionName, caller || "<anonymous>", caller ? "authenticated" : "anonymous", reason),
      );
    }
    throwDenied(reason);
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

/** Convex trusts only Clerk's audience-specific website token (auth.config.ts).
 * OAuth access tokens are verified separately by /mcp and are never website sessions.
 * Native Clerk Convex sessions can include sid without azp. Missing azp is valid.
 */
export async function requireWebsitePerson(ctx:Pick<ActionCtx|MutationCtx,"auth">){
 const identity=await ctx.auth.getUserIdentity();
 const configured=process.env.CLERK_JWT_ISSUER_DOMAIN?.replace(/\/$/,"");
 const issuer=configured==="https://clerk.discovertheirstories.com"?"https://clerk.assistwithfamilyhistory.com":configured;
 const oauthClaims=["client_id","clientId","scope","scp","grant_type","gty"];
 if(!identity?.subject||!issuer||identity.issuer.replace(/\/$/,"")!==issuer||oauthClaims.some(key=>identity[key]!==undefined))throw new Error("Trust boundary denied: missing_identity (website person session required)");
 // The platform verifies signature and aud=convex before exposing this identity.
 // Check exposed audience claims too, so alternate future providers fail closed.
 const origins=new Set(["https://assistwithfamilyhistory.com","https://www.assistwithfamilyhistory.com","https://local.assistwithfamilyhistory.com","http://localhost:3444","http://127.0.0.1:3444","http://family-history.localhost:3443"]);
 // Vercel deployment hashes and git aliases for this project/team only.
 const preview=/^https:\/\/assistwithfamilyhistory-(?:[a-z0-9]+|git-[a-z0-9-]+)-jarvies-projects\.vercel\.app$/;
 for(const azp of [identity.azp,identity.authorizedParty])if(azp!==undefined&&(typeof azp!=="string"||(!origins.has(azp)&&!preview.test(azp))))throw new Error("Website person session required: foreign authorized party");
 const audience=identity.audience??identity.aud;
 if(audience!==undefined&&audience!=="convex"&&!(Array.isArray(audience)&&audience.length===1&&audience[0]==="convex"))throw new Error("Website person session required");
 return identity;
}
