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

// GEN-87 Option A (Phase 0 / shadow): return a ConvexHttpClient carrying the
// caller's verified Clerk JWT (template "convex"), so Convex functions can read
// the owner from ctx.auth.getUserIdentity() instead of a trusted argument. This
// is INERT today — no Convex function reads getUserIdentity() and no call site
// uses this client yet, so attaching the token changes no results. It exists so
// the identity is flowing end-to-end before Phase 1 enforcement is wired.
// Falls back to the unauthenticated client when Clerk is off or no user is
// signed in (guests), preserving current behavior.
export async function getAuthedConvexClient(): Promise<ConvexHttpClient> {
  const client = getConvexClient();

  if (!isClerkEnabled()) {
    return client;
  }

  try {
    const { getToken } = await auth();
    const token = await getToken({ template: "convex" });
    if (token) {
      client.setAuth(token);
    }
  } catch (error) {
    // Never break a read if token minting fails (e.g. dynamic-usage during
    // static render, or no active session): fall through unauthenticated.
    logServerFailure(
      "convex.auth_token_mint_failed",
      { route: "convex", configured: isConvexConfigured() },
      error,
    );
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
