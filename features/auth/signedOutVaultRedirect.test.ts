import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, type NextFetchEvent } from "next/server";
import {
  isVaultPageRead,
  signedOutVaultSignInLocation,
} from "@/lib/vault/signedOutVaultRedirect";

const VAULT_PAGES = [
  "/app",
  "/app/imports",
  "/app/people",
  "/app/queue",
  "/app/story-writer",
] as const;

const state = vi.hoisted(() => ({
  userId: null as string | null,
  protect: vi.fn(async () => undefined),
}));

vi.mock("@clerk/nextjs/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@clerk/nextjs/server")>();
  return {
    ...actual,
    clerkMiddleware: (
      handler: (
        auth: () => Promise<{ userId: string | null }>,
        req: NextRequest,
      ) => Promise<Response | undefined>,
    ) => {
      return async (req: NextRequest) => {
        const auth = Object.assign(async () => ({ userId: state.userId }), {
          protect: state.protect,
        });
        return handler(auth, req);
      };
    },
  };
});

function enableClerk() {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("REQUIRE_AUTH", "true");
  vi.stubEnv("ALLOW_ANONYMOUS_VAULT", "false");
  vi.stubEnv("NEXT_PUBLIC_ALLOW_ANONYMOUS_VAULT", "false");
  vi.stubEnv("DISABLE_CLERK", "false");
  vi.stubEnv("NEXT_PUBLIC_DISABLE_CLERK", "false");
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_synthetic");
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_synthetic");
}

async function loadProxy() {
  return (await import("../../proxy")).default;
}

describe("vault page sign-in location", () => {
  it.each(VAULT_PAGES)("sends a signed-out read of %s back to that page", (pathname) => {
    const current = new URL(`https://assistwithfamilyhistory.com${pathname}`);
    const signIn = signedOutVaultSignInLocation(current);
    expect(signIn.pathname).toBe("/sign-in");
    expect(signIn.searchParams.get("redirect_url")).toBe(current.toString());
    expect(isVaultPageRead(pathname, "GET")).toBe(true);
    expect(isVaultPageRead(pathname, "HEAD")).toBe(true);
  });

  it("keeps the query string on the return url", () => {
    const current = new URL("https://assistwithfamilyhistory.com/app/stories?status=published");
    expect(signedOutVaultSignInLocation(current).searchParams.get("redirect_url")).toBe(
      current.toString(),
    );
  });

  it("does not treat api routes or writes as vault page reads", () => {
    expect(isVaultPageRead("/api/people", "GET")).toBe(false);
    expect(isVaultPageRead("/app", "POST")).toBe(false);
    expect(isVaultPageRead("/features", "GET")).toBe(false);
  });
});

describe("signed-out vault page proxy", () => {
  beforeEach(() => {
    vi.resetModules();
    state.userId = null;
    state.protect.mockReset();
    enableClerk();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(VAULT_PAGES)(
    "redirects a signed-out %s read to sign-in instead of a 404",
    async (pathname) => {
      const proxy = await loadProxy();
      const requestUrl = `https://synthetic.example${pathname}`;
      const response = await proxy(
        new NextRequest(requestUrl, { headers: { accept: "*/*" } }),
        {} as NextFetchEvent,
      );

      expect(response?.status).toBe(307);
      const location = new URL(response?.headers.get("location") ?? "", requestUrl);
      expect(location.pathname).toBe("/sign-in");
      expect(location.searchParams.get("redirect_url")).toBe(requestUrl);
      expect(response?.headers.get("cache-control")).toBe("private, no-store");
      expect(state.protect).not.toHaveBeenCalled();
    },
  );

  it("keeps a signed-in vault read on auth.protect()", async () => {
    state.userId = "user_synthetic";
    const proxy = await loadProxy();
    const response = await proxy(
      new NextRequest("https://synthetic.example/app/people"),
      {} as NextFetchEvent,
    );
    expect(state.protect).toHaveBeenCalledOnce();
    expect(response?.status).not.toBe(307);
  });

  it("keeps api reads, vault writes, and credentialed calls on auth.protect()", async () => {
    const proxy = await loadProxy();
    const cases = [
      new NextRequest("https://synthetic.example/api/people"),
      new NextRequest("https://synthetic.example/app/people", { method: "POST" }),
      new NextRequest("https://synthetic.example/app", {
        headers: { authorization: "Bearer synthetic" },
      }),
    ];

    for (const request of cases) {
      state.protect.mockClear();
      const response = await proxy(request, {} as NextFetchEvent);
      expect(state.protect).toHaveBeenCalledOnce();
      expect(response).toBeUndefined();
    }
  });

  it("still canonicalizes a retired production host before sign-in", async () => {
    const proxy = await loadProxy();
    const response = await proxy(
      new NextRequest("https://discovertheirstories.com/app/queue"),
      {} as NextFetchEvent,
    );
    expect(response?.status).toBe(308);
    expect(response?.headers.get("location")).toBe(
      "https://assistwithfamilyhistory.com/app/queue",
    );
    expect(state.protect).not.toHaveBeenCalled();
  });

  it("keeps the anonymous vault preview when auth is not required", async () => {
    vi.stubEnv("REQUIRE_AUTH", "false");
    vi.stubEnv("ALLOW_ANONYMOUS_VAULT", "true");
    const proxy = await loadProxy();
    const response = await proxy(
      new NextRequest("https://synthetic.example/app"),
      {} as NextFetchEvent,
    );
    expect(response?.status).not.toBe(307);
    expect(response?.headers.get("location")).toBeNull();
    expect(response?.headers.get("set-cookie")).toContain("vault-preview-id=");
    expect(state.protect).not.toHaveBeenCalled();
  });
});
