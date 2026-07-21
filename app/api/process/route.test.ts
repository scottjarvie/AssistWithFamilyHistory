import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  chatCompletion: vi.fn(),
  getAuthedConvexClient: vi.fn(),
  getVaultAccessContext: vi.fn(),
  isConvexConfigured: vi.fn(),
  limiterMutation: vi.fn(),
}));

vi.mock("@/lib/ai/openrouter", () => ({
  chatCompletion: mocks.chatCompletion,
}));

vi.mock("@/lib/convex/server", () => ({
  getAuthedConvexClient: mocks.getAuthedConvexClient,
  isConvexConfigured: mocks.isConvexConfigured,
}));

vi.mock("@/lib/vault/server", () => ({
  getVaultAccessContext: mocks.getVaultAccessContext,
}));

import { POST } from "./route";

function processRequest(overrides: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/process", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: "Summarize this synthetic public-history note.",
      apiKey: "synthetic-client-key",
      privacyAcknowledged: true,
      redactionMode: "not_applicable",
      ...overrides,
    }),
  }) as NextRequest;
}

async function expectBlocked(
  expectedStatus: number,
  overrides: Record<string, unknown> = {},
) {
  const response = await POST(processRequest(overrides));
  expect(response.status).toBe(expectedStatus);
  expect(mocks.chatCompletion).not.toHaveBeenCalled();
  return response;
}

describe("POST /api/process authenticated AI spend gate", () => {
  beforeEach(() => {
    mocks.isConvexConfigured.mockReturnValue(true);
    mocks.getVaultAccessContext.mockResolvedValue({
      vaultOwnerId: "user_synthetic_owner",
      userId: "user_synthetic_owner",
      mode: "user",
    });
    mocks.limiterMutation.mockResolvedValue({
      allowed: true,
      remaining: 9,
      limit: 10,
      windowStart: 0,
    });
    mocks.getAuthedConvexClient.mockResolvedValue({
      mutation: mocks.limiterMutation,
    });
    mocks.chatCompletion.mockResolvedValue({
      success: true,
      data: "Synthetic response",
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    });
  });

  it("fails before provider work when Convex is not configured", async () => {
    mocks.isConvexConfigured.mockReturnValue(false);

    const response = await expectBlocked(503);

    expect(mocks.getVaultAccessContext).not.toHaveBeenCalled();
    expect(mocks.getAuthedConvexClient).not.toHaveBeenCalled();
  });

  it("fails before provider work for a signed-out caller", async () => {
    mocks.getVaultAccessContext.mockResolvedValue({
      vaultOwnerId: "anonymous-vault",
      userId: null,
      mode: "anonymous",
    });

    const response = await expectBlocked(401);

    expect(mocks.getAuthedConvexClient).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ error: "Authentication required" });
  });

  it("fails before provider work when Clerk token minting or Convex auth fails", async () => {
    mocks.getAuthedConvexClient.mockRejectedValue(new Error("synthetic token mint failure"));

    const response = await expectBlocked(503);

    expect(mocks.getAuthedConvexClient).toHaveBeenCalledWith({
      requireAuthentication: true,
    });
    expect(mocks.limiterMutation).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      error: "AI request authorization unavailable",
    });
  });

  it("fails before provider work when the limiter is unavailable", async () => {
    mocks.limiterMutation.mockRejectedValue(new Error("synthetic limiter outage"));

    const response = await expectBlocked(503);

    expect(await response.json()).toMatchObject({
      error: "AI request authorization unavailable",
    });
  });

  it("preserves 429 and Retry-After for an exhausted authenticated caller", async () => {
    mocks.limiterMutation.mockResolvedValue({
      allowed: false,
      retryAfterMs: 12_345,
      limit: 10,
      windowStart: 0,
    });

    const response = await expectBlocked(429);

    expect(response.headers.get("Retry-After")).toBe("13");
    expect(await response.json()).toMatchObject({
      error: "Rate limit exceeded",
      retryAfterMs: 12_345,
    });
  });

  it("keeps the privacy refusal ahead of authentication, limiter, and provider work", async () => {
    await expectBlocked(422, {
      redactionMode: "redacted",
      data: "Living person contact: synthetic.person@example.com",
    });

    expect(mocks.isConvexConfigured).not.toHaveBeenCalled();
    expect(mocks.getVaultAccessContext).not.toHaveBeenCalled();
    expect(mocks.getAuthedConvexClient).not.toHaveBeenCalled();
    expect(mocks.limiterMutation).not.toHaveBeenCalled();
  });

  it("calls the provider only after authenticated quota is consumed", async () => {
    const response = await POST(processRequest());

    expect(response.status).toBe(200);
    expect(mocks.limiterMutation).toHaveBeenCalledOnce();
    expect(mocks.chatCompletion).toHaveBeenCalledOnce();
  });
});
