#!/usr/bin/env node
/**
 * Is production actually serving this commit's chosen-AI surface?
 *
 * Run on demand — `pnpm check:production-live`. Deliberately NOT in
 * `pnpm verify`: it talks to the live internet, and `pnpm verify` is offline
 * and fast on purpose.
 *
 * ## Why this file exists
 *
 * On 2026-08-17 several sessions in a row concluded that production was stale
 * and that the release had never landed. The single piece of evidence was this
 * command, which `docs/operations/bring-your-ai-provider-actions.md` had
 * promoted to "the clearest single signal of whether this release landed":
 *
 * ```
 * curl -sS -o /dev/null -w '%{http_code}\n' https://assistwithfamilyhistory.com/app/settings/ai
 * # expect 200
 * ```
 *
 * It returned **404** on every build, no matter what was deployed.
 * `/app/*` is a protected route. A signed-out read is redirected to
 * `/sign-in` and back to the requested page, for a browser and for curl.
 * That used to be true only when the request accepted HTML. Anything else
 * was rewritten to 404 (`x-clerk-auth-reason: protect-rewrite`), so a bare
 * curl looked exactly like a missing route. On 2026-08-17 that 404 was read
 * as a failed deploy. It was not: production was current, and 200 was never
 * a reachable expectation while signed out.
 *
 * The cost of that mistake was large: a correct, healthy production deployment
 * was read as a failed one, and work was queued to "recover" it.
 *
 * ## The rule this encodes
 *
 * **Never infer deploy freshness from the status code of an authenticated
 * route.** A signed-out vault page redirects to sign-in on every build. That
 * redirect is not a freshness signal, and a 404 there is a regression, not
 * proof of which commit is deployed. Prove freshness from an
 * unauthenticated, content-bearing surface instead. `/ai.txt` is exactly that:
 * public, generated from `lib/mcp/catalog.ts`, and therefore a direct
 * fingerprint of the deployed catalogue.
 */
import {
  FAMILY_HISTORY_CANONICAL_TOOL_NAMES,
  FAMILY_HISTORY_SCOPES,
} from "../lib/mcp/catalog";

const BASE = (process.env.PRODUCTION_BASE_URL ?? "https://assistwithfamilyhistory.com").replace(/\/$/, "");
const MCP_URL = `${BASE}/mcp`;

const BROWSER_ACCEPT =
  "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8";

const failures: string[] = [];

const SIGNED_OUT_VAULT_PAGES = [
  "/app",
  "/app/imports",
  "/app/people",
  "/app/queue",
  "/app/story-writer",
  "/app/settings/ai",
] as const;

function ok(label: string, detail: string) {
  console.log(`  PASS  ${label} — ${detail}`);
}

function fail(label: string, detail: string) {
  console.log(`  FAIL  ${label} — ${detail}`);
  failures.push(`${label}: ${detail}`);
}

/* ---------------------------------------------------------------- 1 · freshness */

async function checkCatalogueIsCurrent() {
  const response = await fetch(`${BASE}/ai.txt`, { redirect: "follow" });
  if (!response.ok) {
    fail("/ai.txt reachable", `expected 200, got ${response.status}`);
    return;
  }
  const body = await response.text();

  const missingTools = FAMILY_HISTORY_CANONICAL_TOOL_NAMES.filter(
    (name) => !body.includes(name),
  );
  if (missingTools.length > 0) {
    fail(
      "deployed tool catalogue is current",
      `production /ai.txt is missing ${missingTools.length} of ${FAMILY_HISTORY_CANONICAL_TOOL_NAMES.length} ` +
        `canonical tool names (${missingTools.slice(0, 4).join(", ")}${missingTools.length > 4 ? ", …" : ""}). ` +
        "Production is genuinely behind this commit — check the Vercel build for main.",
    );
  } else {
    ok(
      "deployed tool catalogue is current",
      `all ${FAMILY_HISTORY_CANONICAL_TOOL_NAMES.length} canonical family_history_* tools are live`,
    );
  }

  const missingScopes = FAMILY_HISTORY_SCOPES.filter((scope) => !body.includes(scope));
  if (missingScopes.length > 0) {
    fail(
      "deployed permission catalogue is current",
      `production /ai.txt does not name ${missingScopes.join(", ")}`,
    );
  } else {
    ok("deployed permission catalogue is current", `all ${FAMILY_HISTORY_SCOPES.length} product permissions are named`);
  }
}

/* ------------------------------------------------------- 2 · the auth boundary */

async function expectSignedOutVaultRedirect(path: string, accept: string, label: string) {
  const response = await fetch(`${BASE}${path}`, {
    headers: { accept },
    redirect: "manual",
  });
  const location = response.headers.get("location") ?? "";
  let returnTo = "";
  try {
    returnTo = new URL(location, BASE).searchParams.get("redirect_url") ?? "";
  } catch {
    returnTo = "";
  }
  const returnsToPage = returnTo === `${BASE}${path}`;

  if ((response.status === 307 || response.status === 302) && location.includes("/sign-in") && returnsToPage) {
    ok(label, `${response.status} → /sign-in, then back to ${path}`);
    return;
  }
  if (response.status === 200) {
    fail(label, "returned 200 to a signed-out visitor");
    return;
  }
  fail(
    label,
    `expected 307 → /sign-in?redirect_url=${BASE}${path}, got ${response.status} location=${location || "(none)"}`,
  );
}

async function checkProtectedRouteRefusesCorrectly() {
  for (const path of SIGNED_OUT_VAULT_PAGES) {
    await expectSignedOutVaultRedirect(
      path,
      BROWSER_ACCEPT,
      `${path} redirects a signed-out browser to sign-in`,
    );
    await expectSignedOutVaultRedirect(
      path,
      "*/*",
      `${path} redirects a signed-out non-document read to sign-in`,
    );
  }
}

/* ------------------------------------------------- 3 · the MCP door and metadata */

async function checkMcpChallenge() {
  const response = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });

  if (response.status !== 401) {
    fail("/mcp challenges an anonymous caller", `expected 401, got ${response.status}`);
    return;
  }
  const challenge = response.headers.get("www-authenticate") ?? "";
  if (!challenge.toLowerCase().startsWith("bearer")) {
    fail("/mcp challenges an anonymous caller", "401 carried no Bearer challenge");
    return;
  }
  if (!challenge.includes("resource_metadata=")) {
    fail(
      "/mcp challenges an anonymous caller",
      "the Bearer challenge omits resource_metadata, so a client cannot discover the authorization server",
    );
    return;
  }
  ok("/mcp challenges an anonymous caller", "401 with a Bearer challenge naming resource_metadata");
}

async function checkResourceMetadata() {
  const pathSpecificUrl = `${BASE}/.well-known/oauth-protected-resource/mcp`;
  const rootCompatibilityUrl = `${BASE}/.well-known/oauth-protected-resource`;
  const response = await fetch(pathSpecificUrl, { redirect: "manual" });
  if (!response.ok) {
    fail("protected-resource metadata", `expected 200, got ${response.status}`);
    return null;
  }
  const doc = (await response.json()) as {
    resource?: string;
    authorization_servers?: string[];
  };

  if (doc.resource !== MCP_URL) {
    fail("protected-resource metadata", `resource is ${doc.resource}, expected ${MCP_URL}`);
  } else {
    ok("protected-resource metadata", `names ${doc.resource}`);
  }

  const authorizationServer = doc.authorization_servers?.[0];
  if (!authorizationServer) {
    fail("protected-resource metadata", "names no authorization server");
    return null;
  }
  ok("authorization server discoverable", authorizationServer);

  const rootResponse = await fetch(rootCompatibilityUrl, { redirect: "manual" });
  if (!rootResponse.ok) {
    fail(
      "root protected-resource compatibility metadata",
      `expected direct 200, got ${rootResponse.status}`,
    );
  } else if (rootResponse.headers.has("location")) {
    fail(
      "root protected-resource compatibility metadata",
      `returned a redirect location (${rootResponse.headers.get("location")})`,
    );
  } else {
    const rootDoc = (await rootResponse.json()) as {
      resource?: string;
      authorization_servers?: string[];
    };
    if (JSON.stringify(rootDoc) !== JSON.stringify(doc)) {
      fail(
        "root protected-resource compatibility metadata",
        "the root and resource-path discovery documents differ",
      );
    } else {
      ok(
        "root protected-resource compatibility metadata",
        "direct 200 with the same document and no redirect",
      );
    }
  }

  return authorizationServer;
}

/* ------------------------------ 4 · product scopes must never be provider scopes */

async function checkAuthorizationServer(authorizationServer: string) {
  const response = await fetch(
    `${authorizationServer.replace(/\/$/, "")}/.well-known/oauth-authorization-server`,
  );
  if (!response.ok) {
    fail("authorization-server metadata", `expected 200, got ${response.status}`);
    return;
  }
  const doc = (await response.json()) as {
    registration_endpoint?: string;
    scopes_supported?: string[];
  };

  if (doc.registration_endpoint) {
    ok("dynamic client registration is offered", doc.registration_endpoint);
  } else {
    fail(
      "dynamic client registration is offered",
      "no registration_endpoint — a client cannot self-register, which is the supported onboarding path",
    );
  }

  const leaked = (doc.scopes_supported ?? []).filter((scope) => scope.startsWith("family_history:"));
  if (leaked.length > 0) {
    fail(
      "product permissions are not advertised as provider scopes",
      `the sign-in provider advertises ${leaked.join(", ")}. It cannot issue them, so any client that ` +
        "asks for them is refused with invalid_scope before the person sees a consent screen.",
    );
  } else {
    ok(
      "product permissions are not advertised as provider scopes",
      "scopes_supported carries identity scopes only",
    );
  }
}

/* ------------------------------------------------------------------------ run */

async function main() {
  console.log(`Probing production at ${BASE}\n`);

  console.log("Is the deployed chosen-AI surface current?");
  await checkCatalogueIsCurrent();

  console.log("\nIs the auth boundary refusing correctly?");
  await checkProtectedRouteRefusesCorrectly();

  console.log("\nCan a client discover how to connect?");
  await checkMcpChallenge();
  const authorizationServer = await checkResourceMetadata();
  if (authorizationServer) {
    await checkAuthorizationServer(authorizationServer);
  }

  if (failures.length > 0) {
    console.error(`\nProduction liveness check FAILED (${failures.length}):\n`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }

  console.log(
    "\nProduction liveness check passed. The deployed catalogue matches this commit " +
      "and the connection door is discoverable.\n" +
      "This proves the code is deployed. It does not prove any AI client has completed " +
      "a connection lifecycle here — see docs/operations/bring-your-ai-provider-actions.md §4.",
  );
}

main().catch((error) => {
  console.error("Production liveness check could not complete:", error);
  process.exit(1);
});
