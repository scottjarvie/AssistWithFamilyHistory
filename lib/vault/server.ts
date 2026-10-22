import { localPublicAuthEnabled, verifyLocalSession } from "@/lib/localLiveAuth";
import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { isAnonymousVaultEnabled, isClerkEnabled } from "@/lib/clerk/config";
import {
  DEFAULT_ANONYMOUS_VAULT_OWNER,
  DEFAULT_LOCAL_VAULT_OWNER,
  VAULT_PREVIEW_COOKIE,
} from "@/lib/vault/constants";

export interface VaultAccessContext {
  vaultOwnerId: string;
  userId: string | null;
  mode: "user" | "local" | "anonymous";
}

function isExpectedDynamicServerUsage(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const digest = "digest" in error ? String(error.digest) : "";
  const description = "description" in error ? String(error.description) : "";
  const message = "message" in error ? String(error.message) : "";

  return (
    digest === "DYNAMIC_SERVER_USAGE" ||
    description.includes("Dynamic server usage") ||
    message.includes("Dynamic server usage")
  );
}

export async function getVaultAccessContext(): Promise<VaultAccessContext> {
  if (localPublicAuthEnabled()) {
    const session = await verifyLocalSession((await cookies()).get("__session")?.value);
    if (!session) throw new Error("Authentication required for local vault access");
    return {vaultOwnerId:session.userId,userId:session.userId,mode:"user"};
  }
  if (!isClerkEnabled()) {
    // Shared local ownership is only for non-hosted development/test use.
    // REQUIRE_AUTH must fail closed even during the Convex shadow rollout.
    if (process.env.REQUIRE_AUTH === "true" || process.env.NODE_ENV === "production" || process.env.VERCEL) {
      throw new Error("Vault access requires Clerk authentication to be configured and enabled");
    }
    return {
      vaultOwnerId: DEFAULT_LOCAL_VAULT_OWNER,
      userId: null,
      mode: "local",
    };
  }

  try {
    const authState = await auth();
    if (authState.userId) {
      return {
        vaultOwnerId: authState.userId,
        userId: authState.userId,
        mode: "user",
      };
    }
  } catch (error) {
    if (!isExpectedDynamicServerUsage(error)) {
      console.warn("Unable to resolve Clerk auth for vault access:", error);
    }
  }

  if (process.env.REQUIRE_AUTH === "true" || !isAnonymousVaultEnabled()) {
    throw new Error("Authentication required for vault access. Set ALLOW_ANONYMOUS_VAULT=true only for explicit guest-preview deployments.");
  }

  const cookieStore = await cookies();
  const cookieOwner = cookieStore.get(VAULT_PREVIEW_COOKIE)?.value?.trim();

  return {
    vaultOwnerId: cookieOwner || DEFAULT_ANONYMOUS_VAULT_OWNER,
    userId: null,
    mode: "anonymous",
  };
}
