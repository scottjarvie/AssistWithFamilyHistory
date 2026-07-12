import { ConvexHttpClient } from "convex/browser";
import { auth } from "@clerk/nextjs/server";
import { isClerkEnabled } from "@/lib/clerk/config";
import { logServerFailure } from "@/lib/server/safeLog";

export type ConvexBackendState = "ready" | "missing" | "stale" | "error";

export interface ConvexRuntimeIssue {
  state: ConvexBackendState;
  title: string;
  description: string;
  statusCode: number;
}

export function getConvexUrl(): string | null {
  return process.env.NEXT_PUBLIC_CONVEX_URL || null;
}

export function isConvexConfigured(): boolean {
  return Boolean(getConvexUrl());
}

export function getConvexClient(): ConvexHttpClient {
  const convexUrl = getConvexUrl();

  if (!convexUrl) {
    throw new Error("Missing NEXT_PUBLIC_CONVEX_URL");
  }

  return new ConvexHttpClient(convexUrl);
}

// Tenant-private Convex calls must carry the caller's verified Clerk JWT. In
// shadow mode we preserve the legacy anonymous fallback so would-be denials can
// be measured. In enforce mode a missing Clerk/JWT configuration or token is a
// hard failure: silently sending an unauthenticated request would make every
// protected operation fail farther downstream with less useful diagnostics.
export async function getAuthedConvexClient(): Promise<ConvexHttpClient> {
  const client = getConvexClient();
  const enforcing = process.env.TRUST_BOUNDARY_MODE === "enforce";

  // Only mint a "convex" template token in an environment actually configured
  // for Convex auth — i.e. where CLERK_JWT_ISSUER_DOMAIN is set (the same gate
  // that makes Convex trust the token; see auth.config.ts). This keeps the call
  // a complete no-op anywhere the convex JWT template / issuer aren't set up
  // (e.g. production until GEN-103 step E), so we never attempt — or error on —
  // a getToken({template:"convex"}) the instance can't satisfy.
  if (!isClerkEnabled() || !process.env.CLERK_JWT_ISSUER_DOMAIN) {
    if (enforcing) {
      throw new Error(
        "Convex trust-boundary enforcement requires Clerk and CLERK_JWT_ISSUER_DOMAIN",
      );
    }
    return client;
  }

  try {
    const { getToken } = await auth();
    const token = await getToken({ template: "convex" });
    if (token) {
      client.setAuth(token);
      return client;
    }
    if (enforcing) {
      throw new Error("Convex trust-boundary enforcement requires an authenticated Clerk session");
    }
  } catch (error) {
    logServerFailure(
      "convex.auth_token_mint_failed",
      { route: "convex", configured: isConvexConfigured() },
      error,
    );
    if (enforcing) {
      throw new Error("Unable to authenticate this protected Convex request", { cause: error });
    }
  }

  return client;
}

export function getConvexReadyStatus(): ConvexRuntimeIssue {
  return {
    state: "ready",
    title: "Vault backend connected",
    description:
      "The canonical Research Vault is available. Imports will merge into Convex and appear across People, Places, Research, and context packs.",
    statusCode: 200,
  };
}

export function getConvexUnavailableState(scope: string, capability: string): ConvexRuntimeIssue {
  const url = getConvexUrl();

  if (!url) {
    return {
      state: "missing",
      title: `${scope} requires the vault backend`,
      description: `${capability} Configure \`NEXT_PUBLIC_CONVEX_URL\` and run \`npx convex dev\` or deploy the latest Convex functions to enable the canonical Research Vault.`,
      statusCode: 503,
    };
  }

  return {
    state: "stale",
    title: `${scope} requires a current vault deployment`,
    description: `${capability} Run \`npx convex dev\` or deploy the latest Convex functions, then refresh.`,
    statusCode: 503,
  };
}

export function getConvexRuntimeIssue(error?: unknown): ConvexRuntimeIssue {
  if (!getConvexUrl()) {
    return {
      state: "missing",
      title: "Vault backend unavailable",
      description:
        "Configure `NEXT_PUBLIC_CONVEX_URL` and run `npx convex dev` or deploy the latest Convex functions to enable the canonical Research Vault.",
      statusCode: 503,
    };
  }

  const message = error instanceof Error ? error.message : "Unknown Convex error";
  logServerFailure("convex.runtime_failure", {
    route: "convex",
    configured: Boolean(getConvexUrl()),
  }, error);

  if (
    /Could not find (public )?function/i.test(message) ||
    /Could not find function/i.test(message) ||
    /is not a function/i.test(message)
  ) {
    return {
      state: "stale",
      title: "Convex Deployment Needs Update",
      description:
        "This page depends on the new Research Vault Convex functions, but the current deployment does not have them yet. Run `npx convex dev` or deploy the latest Convex functions, then refresh.",
      statusCode: 503,
    };
  }

  return {
    state: "error",
    title: "Vault backend request failed",
    description:
      "The vault backend could not complete the request. Refresh and try again, or check local Convex logs if you are developing.",
    statusCode: 503,
  };
}
