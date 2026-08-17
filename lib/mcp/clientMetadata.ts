/**
 * Client ID Metadata Document validation — PURE, no network, no Convex.
 *
 * CIMD is the preferred client-discovery path in the current MCP authorization
 * spec, and Scott's direction for this build is CIMD-first with Dynamic Client
 * Registration kept only as a bounded compatibility fallback.
 *
 * Everything here is deliberately strict. A client identifier that is an HTTPS
 * URL is an instruction to go and fetch something, which makes it an SSRF
 * surface; the mitigations are (a) this host allowlist, (b) a hard no-redirect
 * policy, and (c) a small response ceiling.
 *
 * KNOWN LIMIT: DNS-level SSRF cannot be fully closed from inside the Convex
 * runtime. We cannot resolve a hostname and pin the connection to the address
 * we checked, so a hostile DNS answer that points a public-looking name at a
 * private address is not detectable here. The host rules below plus refusing
 * every redirect are the mitigation, and the response is never echoed back to
 * a model — only a boolean verdict and a few normalized fields are stored.
 */

export const CLIENT_METADATA_MAX_BYTES = 32 * 1024;

export type ClientMetadataRejection =
  | "NON_HTTPS"
  | "URL_HAS_CREDENTIALS"
  | "URL_HAS_QUERY_OR_FRAGMENT"
  | "PRIVATE_NETWORK_HOST"
  | "MALFORMED_URL"
  | "REDIRECT_REFUSED"
  | "BAD_STATUS"
  | "NOT_JSON"
  | "TOO_LARGE"
  | "CLIENT_ID_MISMATCH"
  | "MISSING_REDIRECT_URIS"
  | "INSECURE_REDIRECT_URI"
  | "PUBLIC_CLIENT_MUST_USE_NONE"
  | "PKCE_NOT_DECLARED";

export type ClientMetadataResult =
  | {
      ok: true;
      clientId: string;
      clientName?: string;
      redirectUris: string[];
      tokenEndpointAuthMethod: string;
    }
  | { ok: false; reason: ClientMetadataRejection; detail: string };

const CLOUD_METADATA_HOSTS = new Set([
  "169.254.169.254",
  "metadata.google.internal",
  "metadata",
  "instance-data",
]);

function reject(
  reason: ClientMetadataRejection,
  detail: string,
): Extract<ClientMetadataResult, { ok: false }> {
  return { ok: false, reason, detail };
}

/** IPv4 literal, IPv6 literal, or a bracketed IPv6 host. */
function isIpLiteral(hostname: string): boolean {
  const bare = hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(bare)) return true;
  // Anything with a colon that parses as a host is an IPv6 literal.
  if (bare.includes(":")) return true;
  return false;
}

/** Hosts that must never be fetched, regardless of what a document claims. */
export function isForbiddenMetadataHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  if (CLOUD_METADATA_HOSTS.has(host)) return true;
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".home.arpa")) return true;
  if (isIpLiteral(host)) return true;
  return false;
}

/**
 * A client_id that is an HTTPS URL must be safe to fetch before we fetch it.
 */
export type ClientIdUrlCheck =
  | { ok: true; url: URL }
  | Extract<ClientMetadataResult, { ok: false }>;

export function validateClientIdUrl(clientId: string): ClientIdUrlCheck {
  let url: URL;
  try {
    url = new URL(clientId);
  } catch {
    return reject("MALFORMED_URL", "The client identifier is not a URL.");
  }
  if (url.protocol !== "https:") return reject("NON_HTTPS", "A Client ID Metadata Document must be served over HTTPS.");
  if (url.username || url.password) return reject("URL_HAS_CREDENTIALS", "The client identifier must not carry credentials.");
  if (url.search || url.hash) {
    return reject("URL_HAS_QUERY_OR_FRAGMENT", "The client identifier must not carry a query string or fragment.");
  }
  if (isForbiddenMetadataHost(url.hostname)) {
    return reject("PRIVATE_NETWORK_HOST", "The client identifier points at a private, loopback, or metadata host.");
  }
  return { ok: true, url };
}

function isAcceptableRedirectUri(value: unknown): boolean {
  if (typeof value !== "string" || !value.trim()) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol === "https:") return !isForbiddenMetadataHost(url.hostname) || isLoopbackHost(url.hostname);
  // The loopback forms an installed MCP client legitimately uses.
  if (url.protocol === "http:") return isLoopbackHost(url.hostname);
  return false;
}

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "127.0.0.1" || host === "localhost" || host === "[::1]" || host === "::1";
}

/**
 * Validate the fetched document body against the exact URL it was fetched from.
 */
export function validateClientMetadataDocument(
  fetchedUrl: string,
  raw: string,
): ClientMetadataResult {
  if (raw.length > CLIENT_METADATA_MAX_BYTES) {
    return reject("TOO_LARGE", `A Client ID Metadata Document must be ${CLIENT_METADATA_MAX_BYTES} bytes or fewer.`);
  }
  let doc: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return reject("NOT_JSON", "A Client ID Metadata Document must be a JSON object.");
    }
    doc = parsed as Record<string, unknown>;
  } catch {
    return reject("NOT_JSON", "The Client ID Metadata Document was not valid JSON.");
  }

  if (typeof doc.client_id !== "string" || doc.client_id !== fetchedUrl) {
    return reject(
      "CLIENT_ID_MISMATCH",
      "The document's client_id must exactly equal the URL it was fetched from.",
    );
  }

  const redirectUris = doc.redirect_uris;
  if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
    return reject("MISSING_REDIRECT_URIS", "The document must declare at least one redirect URI.");
  }
  if (redirectUris.length > 20) {
    return reject("MISSING_REDIRECT_URIS", "The document declares an unreasonable number of redirect URIs.");
  }
  for (const uri of redirectUris) {
    if (!isAcceptableRedirectUri(uri)) {
      return reject(
        "INSECURE_REDIRECT_URI",
        "Every redirect URI must be HTTPS or a loopback address.",
      );
    }
  }

  const authMethod =
    typeof doc.token_endpoint_auth_method === "string" ? doc.token_endpoint_auth_method : "none";
  if (authMethod === "none") {
    // A public client has no secret, so PKCE is the only thing standing between
    // an intercepted code and somebody else's vault. It must be declared.
    const methods = doc.code_challenge_methods_supported;
    const declaresS256 = Array.isArray(methods) && methods.includes("S256");
    if (!declaresS256) {
      return reject(
        "PKCE_NOT_DECLARED",
        'A public client must declare code_challenge_methods_supported containing "S256".',
      );
    }
  } else if (doc.token_endpoint_auth_method !== undefined && authMethod !== "none") {
    // Confidential clients are out of scope for this build: we have no place to
    // hold a client secret and no reason to.
    return reject(
      "PUBLIC_CLIENT_MUST_USE_NONE",
      'This surface accepts public clients only. Declare token_endpoint_auth_method: "none".',
    );
  }

  return {
    ok: true,
    clientId: fetchedUrl,
    clientName: typeof doc.client_name === "string" ? doc.client_name.slice(0, 120) : undefined,
    redirectUris: redirectUris as string[],
    tokenEndpointAuthMethod: authMethod,
  };
}

/**
 * Judge one HTTP response for a metadata document. Kept here, away from the
 * fetch itself, so every rejection path is testable without a network.
 *
 * A redirect is a rejection, not a hop to follow: following one would let a
 * public-looking URL hand us off to anywhere, including the private network.
 */
export function evaluateMetadataResponse(
  fetchedUrl: string,
  response: { status: number; redirected?: boolean; headers: { get(name: string): string | null } },
  bodyText: string,
): ClientMetadataResult {
  if (response.redirected || (response.status >= 300 && response.status < 400)) {
    return reject(
      "REDIRECT_REFUSED",
      "A Client ID Metadata Document must be served directly. Redirects are refused.",
    );
  }
  if (response.status !== 200) {
    return reject("BAD_STATUS", `The metadata URL answered ${response.status}.`);
  }
  if (!isJsonContentType(response.headers.get("content-type"))) {
    return reject("NOT_JSON", "The metadata URL did not answer with JSON.");
  }
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > CLIENT_METADATA_MAX_BYTES) {
    return reject("TOO_LARGE", `A Client ID Metadata Document must be ${CLIENT_METADATA_MAX_BYTES} bytes or fewer.`);
  }
  return validateClientMetadataDocument(fetchedUrl, bodyText);
}

/** Content types we accept for a metadata document. */
export function isJsonContentType(value: string | null): boolean {
  if (!value) return false;
  const type = value.split(";")[0]!.trim().toLowerCase();
  return type === "application/json" || type.endsWith("+json");
}
