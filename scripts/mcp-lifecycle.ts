#!/usr/bin/env node
/**
 * Family History chosen-AI lifecycle harness — `pnpm mcp:lifecycle`.
 *
 * This is the eleven-point acceptance ladder in
 * `docs/planning/family-history-bring-your-ai-alignment.md` §5, run as a real
 * MCP client against a real endpoint instead of written down as a procedure a
 * person is trusted to have followed.
 *
 * DELIBERATELY NOT IN `pnpm verify`. It needs a live endpoint, a live token, and
 * a person at the keyboard to approve and revoke a connection — which is the
 * point: approval and revocation are human acts, and a harness that could do
 * them itself would be proving the wrong thing.
 *
 * ## Safety posture
 *
 * - It **refuses to start** unless `MCP_LIFECYCLE_RUN_KEY` matches the
 *   acceptance prefix, so it cannot be pointed at a real person's workspace by
 *   accident.
 * - The access token is read from the environment only. It is never accepted as
 *   an argument (that would put it in shell history) and never printed, not even
 *   truncated.
 * - Every record it creates carries the visible synthetic marker and the run
 *   key, so `convex/mcpAcceptanceFixture.ts` can find and remove exactly them.
 * - It creates nothing through a back door: every record comes through the live
 *   tools, which is what makes step 11's zero-residue re-query meaningful.
 *
 * ## Environment
 *
 * | Variable | Required | What it is |
 * | --- | --- | --- |
 * | `MCP_LIFECYCLE_ENDPOINT` | yes | The `/mcp` URL to test. |
 * | `MCP_LIFECYCLE_TOKEN` | yes | An access token for the synthetic test identity. |
 * | `MCP_LIFECYCLE_RUN_KEY` | yes | Must match `codex-test:awf-joined:<unique>`. |
 * | `MCP_LIFECYCLE_TOKEN_OTHER_OWNER` | no | A second owner's token; enables the real cross-owner half of step 8. |
 * | `MCP_LIFECYCLE_EVIDENCE_IDS` | no | `media:<id>,document:<id>` to exercise real delivery in step 6. |
 * | `NEXT_PUBLIC_CONVEX_URL` + `CONVEX_AUTH_TOKEN` | no | Enables automatic cleanup and the zero-residue re-query in step 11. |
 *
 * Output is one pass/fail line per step and a machine-readable JSON summary on
 * the last line, so a run can be pasted into a Card as evidence.
 */
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

import {
  FAMILY_HISTORY_ACCEPTANCE_CONFIRMATION,
  FAMILY_HISTORY_ACCEPTANCE_MARKER,
  FAMILY_HISTORY_ACCEPTANCE_PREFIX,
} from "../convex/mcpAcceptanceFixture";
import { FAMILY_HISTORY_CANONICAL_TOOL_NAMES, findTool } from "../lib/mcp/catalog";

const PROTOCOL_VERSION = "2026-07-28";
const CONNECTION_SETTINGS_PATH = "/app/settings/ai";

/* ------------------------------------------------------------ guard rails */

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing ${name}. See the header of scripts/mcp-lifecycle.ts.`);
    process.exit(2);
  }
  return value;
}

const runKey = required("MCP_LIFECYCLE_RUN_KEY").toLowerCase();
if (!/^codex-test:awf-joined:[a-z0-9][a-z0-9-]{5,79}$/.test(runKey)) {
  console.error(
    `Refusing to run. MCP_LIFECYCLE_RUN_KEY must begin with ${FAMILY_HISTORY_ACCEPTANCE_PREFIX} ` +
      "and name one unique run. This harness only ever touches marked synthetic records.",
  );
  process.exit(2);
}

const endpoint = new URL(required("MCP_LIFECYCLE_ENDPOINT"));
if (endpoint.protocol !== "https:" && endpoint.hostname !== "localhost" && endpoint.hostname !== "127.0.0.1") {
  console.error("Refusing to run. The endpoint must be HTTPS (or an explicit loopback address).");
  process.exit(2);
}
const token = required("MCP_LIFECYCLE_TOKEN");
if (process.argv.slice(2).some((arg) => arg.includes(token))) {
  console.error("Refusing to run. Never pass the token as an argument; it would land in shell history.");
  process.exit(2);
}
const otherOwnerToken = process.env.MCP_LIFECYCLE_TOKEN_OTHER_OWNER?.trim() || null;

const marker = `${FAMILY_HISTORY_ACCEPTANCE_MARKER} ${runKey}`;
/**
 * The name this harness announces as an MCP client. The server records it as
 * `observedClientName`, and the acceptance fixture recognises the run by it — so
 * the run key has to be part of the name itself. It travels in the protocol's
 * own `clientInfo`, which revision 2026-07-28 repeats on every message; the
 * `Mcp-Name` header is reserved for the tool being called and must not be
 * touched.
 */
const CLIENT_NAME = marker;

/* ---------------------------------------------------------------- runner */

type StepResult = {
  step: number;
  title: string;
  status: "pass" | "fail" | "skipped";
  detail: string;
  evidence?: Record<string, unknown>;
};

const results: StepResult[] = [];
let currentStep = 0;

async function step(
  number: number,
  title: string,
  fn: () => Promise<{ detail: string; evidence?: Record<string, unknown>; skipped?: string }>,
): Promise<boolean> {
  currentStep = number;
  try {
    const outcome = await fn();
    if (outcome.skipped) {
      results.push({ step: number, title, status: "skipped", detail: outcome.skipped });
      console.log(`  ~ ${String(number).padStart(2)} ${title}\n       skipped: ${outcome.skipped}`);
      return true;
    }
    results.push({ step: number, title, status: "pass", detail: outcome.detail, evidence: outcome.evidence });
    console.log(`  ✓ ${String(number).padStart(2)} ${title}\n       ${outcome.detail}`);
    return true;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ step: number, title, status: "fail", detail });
    console.log(`  ✗ ${String(number).padStart(2)} ${title}\n       ${detail}`);
    return false;
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const rl = createInterface({ input, output });
async function waitForPerson(instruction: string): Promise<void> {
  console.log(`\n  → ${instruction}`);
  await rl.question("    Press Enter when that is done… ");
}

/* ------------------------------------------------------- MCP client plumbing */

type ToolCallResult = {
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
  content?: Array<{ type: string; text?: string }>;
};

async function connect(withToken: string): Promise<Client> {
  const client = new Client(
    { name: CLIENT_NAME, version: "1.0.0" },
    { versionNegotiation: { mode: { pin: PROTOCOL_VERSION } } },
  );
  const transport = new StreamableHTTPClientTransport(endpoint, {
    authProvider: { token: async () => withToken },
  });
  await client.connect(transport);
  return client;
}

/** The machine error code on a refusal, or null when the call succeeded. */
function refusalCode(result: ToolCallResult): string | null {
  if (!result.isError) return null;
  const structured = result.structuredContent?.error as { code?: string } | undefined;
  if (structured?.code) return structured.code;
  const text = result.content?.find((block) => block.type === "text")?.text ?? "";
  try {
    return (JSON.parse(text) as { code?: string }).code ?? "UNKNOWN";
  } catch {
    return "UNKNOWN";
  }
}

/** The exact refusal payload, so two refusals can be compared byte for byte. */
function refusalPayload(result: ToolCallResult): string {
  return JSON.stringify(result.structuredContent ?? result.content ?? null);
}

async function call(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  return (await client.callTool({ name, arguments: args })) as ToolCallResult;
}

/* ------------------------------------------------------------- the ladder */

async function main() {
  console.log("Family History chosen-AI lifecycle");
  console.log(`  endpoint: ${endpoint.origin}${endpoint.pathname}`);
  console.log(`  run key:  ${runKey}`);
  console.log("  token:    read from the environment and never printed\n");

  let client: Client | null = null;
  let personId: string | null = null;
  let personUpdatedAt: number | null = null;
  let queueItemId: string | null = null;
  const batchOperationId = `${runKey}:save-records`;
  let batchReceipt = "";

  /* 1 ------------------------------------------------------------------- */
  await step(1, "Anonymous request is challenged with the branded resource", async () => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    assert(response.status === 401, `Expected 401 without a token, saw ${response.status}.`);
    const challenge = response.headers.get("www-authenticate") ?? "";
    assert(challenge.includes("resource_metadata="), "The challenge must carry resource_metadata.");
    assert(
      challenge.includes("/.well-known/oauth-protected-resource/mcp"),
      "The challenge must point at this resource's own metadata document.",
    );
    return { detail: `401 with ${challenge.slice(0, 120)}`, evidence: { status: 401 } };
  });

  /* 2 ------------------------------------------------------------------- */
  await step(2, "Protected-resource metadata is well formed and branded", async () => {
    const metadataUrl = new URL("/.well-known/oauth-protected-resource/mcp", endpoint);
    const response = await fetch(metadataUrl);
    assert(response.status === 200, `Expected 200, saw ${response.status}.`);
    const body = (await response.json()) as {
      resource?: string;
      resource_name?: string;
      authorization_servers?: string[];
      bearer_methods_supported?: string[];
    };
    assert(typeof body.resource === "string" && body.resource.endsWith("/mcp"), "resource must name the /mcp resource.");
    assert(
      body.resource_name === "Assist With Family History",
      `resource_name must be the branded product name, saw ${String(body.resource_name)}.`,
    );
    assert(
      Array.isArray(body.authorization_servers) && body.authorization_servers.length > 0,
      "At least one authorization server must be published.",
    );
    assert(
      body.bearer_methods_supported?.includes("header"),
      "The header bearer method must be published.",
    );
    return {
      detail: `${body.resource} → ${body.authorization_servers?.[0]}`,
      evidence: { resource: body.resource, resourceName: body.resource_name },
    };
  });

  /* 3 ------------------------------------------------------------------- */
  await step(3, "Discovery is filtered by the grant, and empty without one", async () => {
    client = await connect(token);
    let catalog = await client.listTools();
    if (catalog.tools.length === 0) {
      console.log(
        `\n  A connection with no approval sees an empty tool list — that is step 3's first half,\n` +
          "  and it just passed.",
      );
      await waitForPerson(
        `Open ${endpoint.origin}${CONNECTION_SETTINGS_PATH}, find the pending request named\n` +
          `      "${marker}", and approve it with at least context:read, evidence:read,\n` +
          "      research:write, story:draft, queue:read, and queue:work across the whole workspace.",
      );
      await client.close();
      client = await connect(token);
      catalog = await client.listTools();
    }
    assert(catalog.tools.length > 0, "After approval the connection must see its approved tools.");
    const names = new Set(catalog.tools.map((tool) => tool.name));
    for (const name of names) {
      assert(findTool(name), `tools/list returned a name that is not in the catalog: ${name}`);
    }
    const canonicalShown = FAMILY_HISTORY_CANONICAL_TOOL_NAMES.filter((name) => names.has(name));
    assert(canonicalShown.length > 0, "Discovery must return canonical family_history_* names.");
    return {
      detail: `${catalog.tools.length} tools listed, ${canonicalShown.length} canonical, all in the catalog`,
      evidence: { tools: [...names].sort() },
    };
  });

  if (!client) {
    console.error("\nCannot continue without a connected client.");
    await finish();
    return;
  }
  const mcp = client;

  /* 4 ------------------------------------------------------------------- */
  await step(4, "An out-of-scope call refuses with the right code and leaks nothing", async () => {
    const catalog = await mcp.listTools();
    const listed = new Set(catalog.tools.map((tool) => tool.name));
    const notGranted = FAMILY_HISTORY_CANONICAL_TOOL_NAMES.find((name) => !listed.has(name));
    if (!notGranted) {
      return {
        detail: "",
        skipped:
          "This grant covers every tool, so there is no out-of-scope tool to refuse. " +
          "Re-run with a narrower approval to exercise this step.",
      };
    }
    const result = await call(mcp, notGranted, { operationId: `${runKey}:out-of-scope` });
    const code = refusalCode(result);
    assert(code === "SCOPE_NOT_GRANTED", `Expected SCOPE_NOT_GRANTED, saw ${code}.`);
    const payload = refusalPayload(result);
    assert(!payload.includes("vaultOwnerId"), "A refusal must not name an owner.");
    assert(!/[a-z0-9]{20,}/.test(payload.replace(/https?:\/\/\S+/g, "")), "A refusal must not carry a record id.");
    return { detail: `${notGranted} → ${code}`, evidence: { tool: notGranted, code } };
  });

  /* 5 ------------------------------------------------------------------- */
  await step(5, "Queue assignment yields a bounded, provenance-aware brief", async () => {
    let queue = await call(mcp, "family_history_get_queue", { mode: "list", limit: 25 });
    let items = ((queue.structuredContent?.items as Array<Record<string, unknown>>) ?? []).filter(
      (item) => String(item.directive ?? "").includes(runKey),
    );
    if (items.length === 0) {
      await waitForPerson(
        `Create one Queue directive in the app assigned to the chosen AI, whose text begins\n` +
          `      "${marker}". That assignment is a person's act, not this harness's.`,
      );
      queue = await call(mcp, "family_history_get_queue", { mode: "list", limit: 25 });
      items = ((queue.structuredContent?.items as Array<Record<string, unknown>>) ?? []).filter(
        (item) => String(item.directive ?? "").includes(runKey),
      );
    }
    assert(items.length === 1, `Expected exactly one marked Queue item, saw ${items.length}.`);
    queueItemId = String(items[0].id ?? items[0]._id ?? "");
    assert(queueItemId, "The Queue item must expose a stable id.");

    const brief = await call(mcp, "family_history_get_brief", {});
    assert(!brief.isError, `The brief refused: ${refusalPayload(brief)}`);
    const briefBody = JSON.stringify(brief.structuredContent ?? {});
    assert(briefBody.length < 200_000, "The brief must be bounded, not a vault dump.");
    return {
      detail: `Queue item ${queueItemId.slice(0, 8)}… assigned; brief returned ${briefBody.length} bytes`,
      evidence: { queueItemFound: true, briefBytes: briefBody.length },
    };
  });

  /* 6 ------------------------------------------------------------------- */
  await step(6, "Evidence arrives in a batch, and what cannot be delivered says why", async () => {
    const configured = (process.env.MCP_LIFECYCLE_EVIDENCE_IDS ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const [kind, id] = entry.split(":");
        return { kind: kind === "document" ? "document" : "media", id };
      })
      .filter((entry) => entry.id);

    // An id that cannot exist is the deliberate skipped-with-reason item: it must
    // come back skipped with a reason and deliver nothing, and it must be
    // indistinguishable from a real id this grant may not have.
    const items = [...configured, { kind: "media", id: `${runKey}-no-such-item` }];
    const result = await call(mcp, "family_history_get_evidence", { items });
    assert(!result.isError, `The evidence batch refused entirely: ${refusalPayload(result)}`);
    const body = result.structuredContent as {
      delivered?: Array<Record<string, unknown>>;
      skipped?: Array<{ id?: string; reason?: string; whatToDo?: string }>;
    };
    const skipped = body.skipped ?? [];
    const invented = skipped.find((entry) => entry.id?.includes("no-such-item"));
    assert(invented, "The invented item must come back in `skipped`, not silently vanish.");
    assert(invented?.reason, "Every skipped item must carry an exact reason.");
    assert(invented?.whatToDo, "Every skipped item must say what to do about it.");
    const deliveredBody = JSON.stringify(body.delivered ?? []);
    assert(
      !/https?:\/\/[^"]*(blob|b2|backblaze|amazonaws)/i.test(deliveredBody),
      "A raw storage URL must never reach the model.",
    );
    return {
      detail: `${body.delivered?.length ?? 0} delivered, ${skipped.length} skipped (invented id → ${invented?.reason})`,
      evidence: { delivered: body.delivered?.length ?? 0, skippedReasons: skipped.map((s) => s.reason) },
    };
  });

  /* 7 ------------------------------------------------------------------- */
  await step(7, "One batch save, one correction, then a stale write is refused", async () => {
    const result = await call(mcp, "family_history_save_records", {
      operationId: batchOperationId,
      summary: `${marker} One synthetic census household.`,
      people: [
        {
          mode: "create",
          createKey: `${runKey}:person-a`,
          name: { given: "Synthetic", surname: "Householder" },
          sex: "unknown",
          living: false,
          tags: [runKey],
        },
        {
          mode: "create",
          createKey: `${runKey}:person-b`,
          name: { given: "Synthetic", surname: "Spouse" },
          sex: "unknown",
          living: false,
          tags: [runKey],
        },
      ],
      relationships: [
        {
          mode: "create",
          createKey: `${runKey}:couple`,
          type: "Couple",
          person1CreateKey: `${runKey}:person-a`,
          person2CreateKey: `${runKey}:person-b`,
        },
      ],
    });
    assert(!result.isError, `The batch refused: ${refusalPayload(result)}`);
    batchReceipt = JSON.stringify(result.structuredContent ?? {});
    const body = result.structuredContent as {
      results?: { people?: Array<{ id?: string; status?: string }> };
      counts?: { created?: number };
    };
    const people = body.results?.people ?? [];
    assert(people.length === 2, `Expected two per-item person results, saw ${people.length}.`);
    assert(people.every((row) => row.status), "Every batch row must report its own status.");
    personId = people[0]?.id ?? null;
    assert(personId, "The batch must return a stable id for a created person.");

    const context = await call(mcp, "family_history_get_context", { kind: "person", id: personId });
    assert(!context.isError, `Hydration refused: ${refusalPayload(context)}`);
    const hydrated = (context.structuredContent as { person?: { updatedAt?: number } }).person;
    personUpdatedAt = hydrated?.updatedAt ?? null;
    assert(typeof personUpdatedAt === "number", "Hydration must return updatedAt so a correction can be safe.");

    const correction = await call(mcp, "family_history_save_person", {
      operationId: `${runKey}:correction`,
      mode: "update",
      personId,
      expectedUpdatedAt: personUpdatedAt,
      researchStatus: "in_progress",
    });
    assert(!correction.isError, `The intentional correction refused: ${refusalPayload(correction)}`);

    const stale = await call(mcp, "family_history_save_person", {
      operationId: `${runKey}:stale-write`,
      mode: "update",
      personId,
      expectedUpdatedAt: personUpdatedAt,
      researchStatus: "thorough",
    });
    const staleCode = refusalCode(stale);
    assert(staleCode === "STALE_VERSION", `A stale write must be refused as STALE_VERSION, saw ${staleCode}.`);
    return {
      detail: `2 people + 1 relationship saved with per-item results; correction accepted; stale write → ${staleCode}`,
      evidence: { created: body.counts?.created ?? null, staleCode },
    };
  });

  /* 8 ------------------------------------------------------------------- */
  await step(8, "Cross-owner and out-of-boundary refusals leak no existence", async () => {
    assert(personId, "Step 7 must have created a person first.");
    const unknownTool = await call(mcp, "family_history_definitely_not_a_tool", {
      operationId: `${runKey}:unknown-tool`,
    });
    const unknownPayload = refusalPayload(unknownTool);
    const unknownCode = refusalCode(unknownTool);
    assert(unknownCode === "SCOPE_NOT_GRANTED", `An unknown tool must refuse as SCOPE_NOT_GRANTED, saw ${unknownCode}.`);

    // An id shaped like a real record but belonging to nobody here.
    const invented = await call(mcp, "family_history_get_context", {
      kind: "person",
      id: personId.slice(0, -4) + "zzzz",
    });
    const inventedCode = refusalCode(invented);

    let crossOwner: { code: string | null; payload: string } | null = null;
    if (otherOwnerToken) {
      const otherClient = await connect(otherOwnerToken);
      const result = await call(otherClient, "family_history_get_context", { kind: "person", id: personId });
      crossOwner = { code: refusalCode(result), payload: refusalPayload(result) };
      await otherClient.close();
      assert(
        crossOwner.code !== null,
        "Another owner must never be able to read this workspace's person.",
      );
      assert(
        crossOwner.payload === unknownPayload || crossOwner.code === inventedCode,
        "A cross-owner refusal must be indistinguishable from a not-found refusal.",
      );
    }

    return {
      detail:
        `unknown tool → ${unknownCode}; invented id → ${inventedCode}` +
        (crossOwner
          ? `; another owner → ${crossOwner.code}, indistinguishable`
          : "; cross-owner half skipped (set MCP_LIFECYCLE_TOKEN_OTHER_OWNER to prove it)"),
      evidence: {
        unknownToolCode: unknownCode,
        inventedIdCode: inventedCode,
        crossOwnerCode: crossOwner?.code ?? null,
        crossOwnerProved: Boolean(crossOwner),
      },
    };
  });

  /* 9 ------------------------------------------------------------------- */
  await step(9, "Replaying the same operation returns the same result, not a duplicate", async () => {
    const replay = await call(mcp, "family_history_save_records", {
      operationId: batchOperationId,
      summary: `${marker} One synthetic census household.`,
      people: [
        {
          mode: "create",
          createKey: `${runKey}:person-a`,
          name: { given: "Synthetic", surname: "Householder" },
          sex: "unknown",
          living: false,
          tags: [runKey],
        },
      ],
    });
    assert(!replay.isError, `The replay refused: ${refusalPayload(replay)}`);
    const body = replay.structuredContent as { deduplicated?: boolean };
    assert(body.deduplicated === true, "A repeated operationId must be reported as deduplicated.");
    assert(
      JSON.stringify(replay.structuredContent) === batchReceipt,
      "A replay must return the stored receipt verbatim, not a fresh save.",
    );
    return { detail: "Same operationId returned the stored receipt; nothing was written twice", evidence: { deduplicated: true } };
  });

  /* 10 ------------------------------------------------------------------ */
  await step(10, "Revoking denies the very next call, then reconnect recovers", async () => {
    await waitForPerson(
      `Open ${endpoint.origin}${CONNECTION_SETTINGS_PATH} and turn off the connection named\n` +
        `      "${marker}". Do not sign out and do not wait — the same token stays valid,\n` +
        "      which is exactly what this step is testing.",
    );

    const deniedCall = await call(mcp, "family_history_get_brief", {});
    const deniedCode = refusalCode(deniedCall);
    assert(
      deniedCode === "GRANT_REVOKED",
      `The very next call after revoking must refuse as GRANT_REVOKED, saw ${deniedCode}.`,
    );

    const deniedDiscovery = await mcp.listTools();
    assert(
      deniedDiscovery.tools.length === 0,
      `Discovery after revoking must be empty, saw ${deniedDiscovery.tools.length} tools.`,
    );

    await waitForPerson(
      "Now reconnect: in the client, disconnect and re-add the server, then approve the fresh\n" +
        `      request at ${endpoint.origin}${CONNECTION_SETTINGS_PATH}.`,
    );
    const reconnected = await connect(token);
    const catalog = await reconnected.listTools();
    await reconnected.close();
    assert(catalog.tools.length > 0, "After reconnecting and re-approving, tools must be visible again.");
    return {
      detail: `next call → ${deniedCode}, discovery → 0 tools, after reconnect → ${catalog.tools.length} tools`,
      evidence: { deniedCode, toolsAfterReconnect: catalog.tools.length },
    };
  });

  await mcp.close();

  /* 11 ------------------------------------------------------------------ */
  await step(11, "Exact cleanup, then a zero-residue re-query", async () => {
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
    const convexToken = process.env.CONVEX_AUTH_TOKEN?.trim();
    const ownerId = process.env.MCP_LIFECYCLE_OWNER_ID?.trim();
    if (!convexUrl || !convexToken || !ownerId) {
      return {
        detail: "",
        skipped:
          "Set NEXT_PUBLIC_CONVEX_URL, CONVEX_AUTH_TOKEN, and MCP_LIFECYCLE_OWNER_ID to run cleanup " +
          "here. Otherwise run mcpAcceptanceFixture.clear with this run key and re-query manually — " +
          "nothing marked may remain.",
      };
    }
    // The explicit short-lived-token CLI pattern; see scripts/audit-vault.ts and
    // the allowlist in scripts/check-convex-client-auth.ts.
    const convex = new ConvexHttpClient(convexUrl);
    convex.setAuth(convexToken);
    const inspectRef = makeFunctionReference<
      "action",
      { vaultOwnerId: string; runKey: string },
      { exists: boolean; counts: Record<string, number> }
    >("mcpAcceptanceFixture:inspect");
    const clearRef = makeFunctionReference<
      "mutation",
      { vaultOwnerId: string; runKey: string; confirmation: string },
      { removed: boolean; counts: Record<string, number> }
    >("mcpAcceptanceFixture:clear");

    const before = await convex.action(inspectRef, { vaultOwnerId: ownerId, runKey });
    assert(before.exists, "There should be a marked graph to clean up after ten steps of real work.");
    const cleared = await convex.mutation(clearRef, {
      vaultOwnerId: ownerId,
      runKey,
      confirmation: FAMILY_HISTORY_ACCEPTANCE_CONFIRMATION,
    });
    assert(cleared.removed, "Cleanup must report that it removed the marked graph.");
    const after = await convex.action(inspectRef, { vaultOwnerId: ownerId, runKey });
    assert(!after.exists, "The re-query must find nothing.");
    const residue = Object.entries(after.counts).filter(([, count]) => count > 0);
    assert(residue.length === 0, `Residue remains: ${JSON.stringify(residue)}`);
    return {
      detail: `removed ${JSON.stringify(cleared.counts)}; re-query found nothing`,
      evidence: { removed: cleared.counts, residue: after.counts },
    };
  });

  await finish();
}

async function finish() {
  rl.close();
  const passed = results.filter((row) => row.status === "pass").length;
  const failed = results.filter((row) => row.status === "fail").length;
  const skipped = results.filter((row) => row.status === "skipped").length;
  console.log(`\n—— summary ——\n  passed: ${passed}\n  failed: ${failed}\n  skipped: ${skipped}`);
  if (skipped > 0) {
    console.log("  A skipped step is not a passed step. Say so plainly in any evidence you record.");
  }
  console.log(
    JSON.stringify({
      harness: "family-history-mcp-lifecycle",
      runKey,
      endpoint: `${endpoint.origin}${endpoint.pathname}`,
      at: new Date().toISOString(),
      passed,
      failed,
      skipped,
      steps: results,
    }),
  );
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (error) => {
  console.error(`\nThe harness stopped at step ${currentStep}: ${error instanceof Error ? error.message : error}`);
  await finish();
});
