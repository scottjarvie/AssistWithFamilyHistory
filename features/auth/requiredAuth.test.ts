import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, type NextFetchEvent } from "next/server";
import { getVaultAccessContext } from "@/lib/vault/server";
import { getAuthedConvexClient } from "@/lib/convex/server";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  middleware: vi.fn(),
  cookies: vi.fn(),
  getToken: vi.fn(),
  setAuth: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@clerk/nextjs/server")>(),
  auth: mocks.auth,
  clerkMiddleware: vi.fn(() => mocks.middleware),
}));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    setAuth = mocks.setAuth;
  },
}));
vi.mock("@/lib/server/safeLog", () => ({ logServerFailure: vi.fn() }));

// Use synthetic configuration only; no dotenv loader or provider requests.
beforeEach(() => {
  vi.resetModules(); // proxy captures its auth configuration at module load.
  vi.resetAllMocks();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("REQUIRE_AUTH", "true");
  vi.stubEnv("TRUST_BOUNDARY_MODE", "shadow");
  vi.stubEnv("DISABLE_CLERK", "false");
  vi.stubEnv("NEXT_PUBLIC_DISABLE_CLERK", "false");
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
  vi.stubEnv("CLERK_SECRET_KEY", "");
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", "");
  vi.stubEnv("ALLOW_ANONYMOUS_VAULT", "false");
  vi.stubEnv("NEXT_PUBLIC_ALLOW_ANONYMOUS_VAULT", "false");
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://synthetic-auth-test.convex.cloud");
  mocks.auth.mockResolvedValue({ userId: null, getToken: mocks.getToken });
  mocks.cookies.mockResolvedValue({ get: () => ({ value: "guest_synthetic" }) });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected provider request"); }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function enableClerk() {
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_synthetic");
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_synthetic");
}

const unavailableClerk = [
  { name: "missing keys", setup: () => {} },
  { name: "missing secret key", setup: () => {
    enableClerk();
    vi.stubEnv("CLERK_SECRET_KEY", "");
  } },
  { name: "malformed key", setup: () => {
    enableClerk();
    vi.stubEnv("CLERK_SECRET_KEY", "synthetic-invalid-key");
  } },
  ...["DISABLE_CLERK", "NEXT_PUBLIC_DISABLE_CLERK"].map((flag) => ({
    name: flag,
    setup: () => { enableClerk(); vi.stubEnv(flag, "true"); },
  })),
];

describe.each(unavailableClerk)("required auth with $name in shadow mode", ({ setup }) => {
  beforeEach(setup);

  it.each([
    ["/app/people", "GET"],
    ["/api/people", "GET"],
    ["/api/import", "POST"],
  ])("rejects the %s %s request before reaching the route", async (path, method) => {
    // Conflicting guest-preview flags must not override required auth.
    vi.stubEnv("ALLOW_ANONYMOUS_VAULT", "true");
    const { default: proxy } = await import("../../proxy");
    const response = await proxy(
      new NextRequest(`https://synthetic.example${path}`, { method }),
      {} as NextFetchEvent,
    );
    expect(response?.status).toBe(503);
    expect(response?.headers.get("cache-control")).toBe("private, no-store");
    expect(response?.headers.get("x-middleware-next")).toBeNull();
    expect(response?.headers.get("set-cookie")).toBeNull();
    expect(mocks.middleware).not.toHaveBeenCalled();
    expect(mocks.auth).not.toHaveBeenCalled();
  });

  it("does not assign shared local ownership when called directly", async () => {
    await expect(getVaultAccessContext()).rejects.toThrow("requires Clerk");
  });

  it("does not return an unauthenticated client when called directly", async () => {
    await expect(getAuthedConvexClient()).rejects.toThrow("requires Clerk");
    expect(mocks.setAuth).not.toHaveBeenCalled();
  });
});

describe("vault ownership fallback", () => {
  it.each([
    ["production", ""],
    ["development", "1"],
  ])("never uses local-dev on a hosted server (%s, VERCEL=%s)", async (nodeEnv, vercel) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubEnv("VERCEL", vercel);
    vi.stubEnv("REQUIRE_AUTH", "false");
    await expect(getVaultAccessContext()).rejects.toThrow("requires Clerk");
  });

  it("preserves key-free local development when auth is not required", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("REQUIRE_AUTH", "false");
    await expect(getVaultAccessContext()).resolves.toMatchObject({ vaultOwnerId: "local-dev", mode: "local" });
    const { default: proxy } = await import("../../proxy");
    const response = await proxy(new NextRequest("http://localhost/app"), {} as NextFetchEvent);
    expect(response?.headers.get("x-middleware-next")).toBe("1");
  });

  it("enforces required auth even in key-free local development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL", "");
    await expect(getVaultAccessContext()).rejects.toThrow("requires Clerk");
  });
});

describe("required auth session guard", () => {
  beforeEach(enableClerk);

  it.each(["signed-out", "provider failure"])("rejects %s instead of using a guest cookie or shadow client", async (failure) => {
    vi.stubEnv("ALLOW_ANONYMOUS_VAULT", "true");
    vi.stubEnv("NEXT_PUBLIC_ALLOW_ANONYMOUS_VAULT", "true");
    if (failure === "provider failure") mocks.auth.mockRejectedValue(new Error("Synthetic provider failure"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await expect(getVaultAccessContext()).rejects.toThrow("Authentication required");
      expect(mocks.cookies).not.toHaveBeenCalled();
      await expect(getAuthedConvexClient()).rejects.toThrow("Unable to authenticate");
      expect(mocks.getToken).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("keeps signed-in ownership and the pre-issuer shadow rollout working", async () => {
    mocks.auth.mockResolvedValue({ userId: "user_synthetic", getToken: mocks.getToken });
    await expect(getVaultAccessContext()).resolves.toEqual({
      vaultOwnerId: "user_synthetic", userId: "user_synthetic", mode: "user",
    });
    await expect(getAuthedConvexClient()).resolves.toBeDefined();
    expect(mocks.getToken).not.toHaveBeenCalled();
  });

  it("attaches the Convex JWT once the issuer is configured", async () => {
    vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", "https://synthetic-issuer.example");
    mocks.auth.mockResolvedValue({ userId: "user_synthetic", getToken: mocks.getToken });
    mocks.getToken.mockResolvedValue("synthetic-jwt");
    await getAuthedConvexClient();
    expect(mocks.getToken).toHaveBeenCalledWith({ template: "convex" });
    expect(mocks.setAuth).toHaveBeenCalledWith("synthetic-jwt");
  });

  it("fails closed if configured Convex token minting fails", async () => {
    vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", "https://synthetic-issuer.example");
    mocks.auth.mockResolvedValue({ userId: "user_synthetic", getToken: mocks.getToken });
    mocks.getToken.mockResolvedValue(null);
    await expect(getAuthedConvexClient()).rejects.toThrow("Unable to authenticate");
  });

  it.each(["enforce", "explicit requirement"])("still requires the issuer for %s", async (mode) => {
    if (mode === "enforce") vi.stubEnv("TRUST_BOUNDARY_MODE", "enforce");
    await expect(getAuthedConvexClient({ requireAuthentication: mode === "explicit requirement" }))
      .rejects.toThrow("CLERK_JWT_ISSUER_DOMAIN");
  });
});


describe.each(["", "enfroce", "SHADOW", " shadow "])("default tenant enforcement (%s)", (mode) => {
  beforeEach(() => {
    enableClerk();
    vi.stubEnv("TRUST_BOUNDARY_MODE", mode);
    mocks.auth.mockResolvedValue({ userId: "user_synthetic", getToken: mocks.getToken });
  });

  it("requires issuer configuration before constructing a protected transport", async () => {
    await expect(getAuthedConvexClient()).rejects.toThrow("CLERK_JWT_ISSUER_DOMAIN");
    expect(mocks.setAuth).not.toHaveBeenCalled();
  });

  it("refuses missing tokens and attaches a legitimate audience-specific token", async () => {
    vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", "https://synthetic-issuer.example");
    mocks.getToken.mockResolvedValue(null);
    await expect(getAuthedConvexClient()).rejects.toThrow("Unable to authenticate");
    expect(mocks.setAuth).not.toHaveBeenCalled();
    mocks.getToken.mockResolvedValue("synthetic-convex-jwt");
    await expect(getAuthedConvexClient()).resolves.toBeDefined();
    expect(mocks.getToken).toHaveBeenLastCalledWith({ template: "convex" });
    expect(mocks.setAuth).toHaveBeenCalledExactlyOnceWith("synthetic-convex-jwt");
    expect(fetch).not.toHaveBeenCalled();
  });
});
