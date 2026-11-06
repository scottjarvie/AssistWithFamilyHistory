import type { HttpRouter } from "convex/server";
import { z } from "zod";
import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";

const inputSchema = z.object({
  action: z.enum(["inspect", "reduce", "pause", "revoke"]),
  expectedVersion: z.number().int().nonnegative().optional(),
  scopes: z.array(z.string()).max(100).optional(), expiresAt: z.number().optional(),
}).strict();

/** This door only inspects/reduces the credential presented in Authorization. */
export function registerApiKeyAccessRoutes(http: HttpRouter) {
  http.route({ path: "/api-key/access", method: "POST", handler: httpAction(async (ctx, request) => {
    const reply = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
    const token = request.headers.get("authorization")?.match(/^Bearer (dts_live_[a-zA-Z0-9_-]+)\.([a-zA-Z0-9_-]+)$/);
    if (!token) return reply({ error: "A valid API key is required" }, 401);
    if ((await request.clone().arrayBuffer()).byteLength > 16384) return reply({ error: "Request too large" }, 413);
    const parsed = inputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return reply({ error: "Only own-connection inspection and reductions are allowed. To increase access, the person must use Settings > API Center." }, 400);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token[2]));
    const hashedSecret = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
    try {
      return reply(await ctx.runMutation(internal.apiKeys.reduceOwnKey, { ...parsed.data, keyId: token[1], hashedSecret }), 200);
    } catch {
      return reply({ error: "Connection refused or changed. Inspect your own active connection before reducing it. Only the person can increase or restore access in Settings > API Center." }, 403);
    }
  }) });
}
