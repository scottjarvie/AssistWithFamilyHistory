// assist-mcp-connector-media-read v1.0.0 sha256:c627b73eaead64d5f9d20cb2d9330fe9779a1cd6b1b22d155b1fe7bd17534448
// Synced from assistwithlife shared/mcp-connector/media-read.ts. Do not edit here; change it upstream and re-sync.
export const MCP_CONNECTOR_MEDIA_READ_VERSION = "1.0.0";

// Food and Buying allow 3 MiB of raw files per reply. Use the family playbook's
// tighter ceiling on encoded content to leave room for the MCP reply envelope.
export const MEDIA_REPLY_BUDGET_BASE64_CHARS = 3_000_000;
export const MEDIA_REPLY_MAX_BYTES = (MEDIA_REPLY_BUDGET_BASE64_CHARS / 4) * 3;
// Buying caps AI copies at 1 MiB and batches at 12 images. Food allows up to
// 20 files; keep the lower count and apply it to all items, including placeholders.
export const AI_COPY_MAX_BYTES = 1_048_576;
export const MEDIA_REPLY_MAX_ITEMS = 12;
export const AI_COPY_LONG_EDGE = 1_600;
export const AI_ORIGINAL_LINK_TTL_SECONDS = 60;
export const AI_ORIGINAL_LINK_PATH = "/media/ai-original/";
const ORIGINAL_LINK_ISSUE_CLOCK_SKEW_MS = 2_000;

export const MEDIA_READ_LABELS = {
  copy: "Cleaned copy.",
  smallerCopy: "Smaller copy.",
  nextPage: "More files on the next page.",
  invalidCursor: "This page marker is invalid or stale. Start again from page one without a cursor.",
  noCopy: "No cleaned copy exists.",
  tooLarge: "Too large for any reply.",
  originalOnRequest: "You can request the exact original.",
} as const;

export type MediaCopy = {
  id: string;
  sizeBytes: number;
  longEdge?: number;
};

export type MediaReadItem = {
  id: string;
  kind: string;
  originalBytes?: number;
  /** Set only when this caller may request an original for this item. */
  originalAvailable?: boolean;
  /** Cleaned copies only, in preference order, normally best to smallest. */
  copies: readonly MediaCopy[];
};

export type MediaReplyBudget = {
  base64Chars: number;
  maxImageBytes: number;
  maxItems: number;
};

type MediaReplyOptions = {
  /** Canonical server-side identity of the selection, caller and tool arguments. */
  requestKey: string;
  /** A stable server-only HMAC-SHA256 key with sign and verify usages. */
  cursorKey: CryptoKey;
  cursor?: string | null;
  cursorArgument?: string;
  budget?: Partial<MediaReplyBudget>;
};

type PlannedItem =
  | { id: string; kind: string; status: "copy"; copy: MediaCopy; label: string }
  | { id: string; kind: string; status: "placeholder"; label: string };

type MediaReplyPlan =
  | { ok: true; send: PlannedItem[]; nextCursor: string | null; nextPageLabel: string | null }
  | { ok: false; error: "INVALID_MEDIA_CURSOR"; message: string };

const INVALID_CURSOR = { ok: false, error: "INVALID_MEDIA_CURSOR", message: MEDIA_READ_LABELS.invalidCursor } as const;

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function budgetLimit(value: number | undefined, maximum: number): number {
  if (value === undefined) return maximum;
  if (!Number.isSafeInteger(value) || value < 1) throw new Error("Media reply limits must be positive integers.");
  return Math.min(value, maximum);
}

function base64Chars(sizeBytes: number): number {
  return 4 * Math.ceil(sizeBytes / 3);
}

function describeCopy(item: MediaReadItem, copy: MediaCopy, smaller: boolean): string {
  const label = smaller ? MEDIA_READ_LABELS.smallerCopy : MEDIA_READ_LABELS.copy;
  const dimensions = copy.longEdge === undefined ? "" : `${copy.longEdge} px, `;
  const original = item.originalBytes === undefined ? "" : ` of a ${item.originalBytes}-byte original`;
  return `${label} ${dimensions}${copy.sizeBytes} bytes${original}.`;
}

/** Call after resolving and authorizing the same ordered selection on every page. */
export async function planMediaReply(
  items: readonly MediaReadItem[],
  { requestKey, cursorKey, cursor, cursorArgument = "cursor", budget }: MediaReplyOptions,
): Promise<MediaReplyPlan> {
  const totalChars = budgetLimit(budget?.base64Chars, MEDIA_REPLY_BUDGET_BASE64_CHARS);
  const maxImageBytes = budgetLimit(budget?.maxImageBytes, AI_COPY_MAX_BYTES);
  const maxItems = budgetLimit(budget?.maxItems, MEDIA_REPLY_MAX_ITEMS);
  // Only the offset and MAC go into the cursor. The request and selection stay on the server.
  const selection = JSON.stringify([
    requestKey, cursorArgument, totalChars, maxImageBytes, maxItems,
    items.map(({ id, kind, originalBytes, originalAvailable, copies }) => [
      id, kind, originalBytes, originalAvailable === true, copies.map(({ id, sizeBytes, longEdge }) => [id, sizeBytes, longEdge]),
    ]),
  ]);
  const cursorMessage = (offset: number) => new TextEncoder().encode(
    `assist-media-read.m1.${offset}.${selection}`,
  );

  let offset = 0;
  if (cursor != null) {
    const match = /^m1\.([1-9]\d{0,15})\.([0-9a-f]{64})$/.exec(cursor);
    if (!match || match[0] !== cursor) return INVALID_CURSOR;
    offset = Number(match[1]);
    const hex = match[2];
    const mac = Uint8Array.from({ length: 32 }, (_, i) => Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16));
    if (!Number.isSafeInteger(offset) || offset >= items.length ||
        !await crypto.subtle.verify("HMAC", cursorKey, mac, cursorMessage(offset))) {
      return INVALID_CURSOR;
    }
  }

  let remaining = totalChars;
  const send: PlannedItem[] = [];
  for (; offset < items.length && send.length < maxItems; offset += 1) {
    const item = items[offset];
    const { id, kind } = item;
    const mediaKind = kind.toLowerCase();
    const isImage = mediaKind === "image" || mediaKind.startsWith("image/");
    const fits = (copy: MediaCopy, chars: number) =>
      Number.isSafeInteger(copy.sizeBytes) && copy.sizeBytes >= 0 &&
      (!isImage || copy.sizeBytes <= maxImageBytes) && base64Chars(copy.sizeBytes) <= chars;
    const index = item.copies.findIndex((copy) => fits(copy, remaining));
    if (index < 0) {
      if (item.copies.some((copy) => fits(copy, totalChars))) break;
      const reason = item.copies.length ? MEDIA_READ_LABELS.tooLarge : MEDIA_READ_LABELS.noCopy;
      const label = item.originalAvailable === true ? `${reason} ${MEDIA_READ_LABELS.originalOnRequest}` : reason;
      send.push({ id, kind, status: "placeholder", label });
      continue;
    }
    const copy = item.copies[index];
    const smaller = index > 0 || (item.originalBytes !== undefined && copy.sizeBytes < item.originalBytes);
    send.push({ id, kind, status: "copy", copy, label: describeCopy(item, copy, smaller) });
    remaining -= base64Chars(copy.sizeBytes);
  }

  let nextCursor = null;
  if (offset < items.length) {
    const mac = new Uint8Array(await crypto.subtle.sign("HMAC", cursorKey, cursorMessage(offset)));
    nextCursor = `m1.${offset}.${hex(mac)}`;
  }
  const nextPageLabel = nextCursor ? `${MEDIA_READ_LABELS.nextPage} Call again with nextCursor as the ${cursorArgument} argument.` : null;
  return { ok: true, send, nextCursor, nextPageLabel };
}

const STORAGE_HOSTS = ["backblazeb2.com", "backblaze.com", "convex.site", "convex.cloud"];

function isStorageHost(host: string, hosts: readonly string[]): boolean {
  const name = host.toLowerCase().replace(/\.$/, "");
  return [...STORAGE_HOSTS, ...hosts].some((host) => {
    const suffix = host.toLowerCase().replace(/\.$/, "");
    return name === suffix || name.endsWith(`.${suffix}`);
  });
}

/** Check serialized replies for provider hostnames, including site-specific aliases. */
export function assertNoStorageHost(text: string, hosts: readonly string[] = []): void {
  if (/\bX-Amz-(?:Signature|Credential)\b|[?&]Authorization=/i.test(text)) {
    throw new Error("Media reply exposes a signed URL query marker.");
  }
  for (const [host] of text.matchAll(/(?<![a-z0-9-])(?:[a-z0-9-]+\.)+[a-z0-9-]+/gi)) {
    if (isStorageHost(host, hosts)) throw new Error(`Media reply exposes storage host "${host}".`);
  }
  // URL normalizes percent escapes in the hostname.
  for (const [authority] of text.matchAll(/(?<![a-z0-9_+/-])(?:https?:)?\/\/[^\s/"'<>?#\\]+/gi)) {
    if (!authority.includes("%")) continue;
    let host: string;
    try {
      host = new URL(authority, "https://example.invalid").hostname;
    } catch {
      continue;
    }
    if (isStorageHost(host, hosts)) throw new Error(`Media reply exposes storage host "${host}".`);
  }
}

export type OriginalLinkBinding = Readonly<{
  fileId: string;
  kind: string;
  connectionId: string;
  grantId: string;
}>;

export type OriginalLinkClaims = OriginalLinkBinding & Readonly<{
  purpose: "ai-media-original";
  origin: string;
  issuedAt: number;
  expiresAt: number;
}>;

export type StoredOriginalLink = Readonly<{ tokenHash: string; claims: OriginalLinkClaims }>;

export type OriginalLinkPolicy = {
  /** Trusted deployment configuration for the site's public HTTPS origin. */
  siteOrigin: string;
  storageHosts?: readonly string[];
  /** Re-read live connection, grant, owner, record reach, original-read scope and file state. */
  checkAccess: (binding: OriginalLinkBinding) => Promise<false | { grantExpiresAt?: number }>;
  now?: () => number;
};

function ownOrigin({ siteOrigin, storageHosts = [] }: OriginalLinkPolicy): string {
  const url = new URL(siteOrigin);
  if (url.protocol !== "https:" || siteOrigin.replace(/\/$/, "") !== url.origin ||
      isStorageHost(url.hostname, storageHosts)) {
    throw new Error("Configure the site's own HTTPS origin for AI original links.");
  }
  return url.origin;
}

function validBinding(binding: OriginalLinkBinding): boolean {
  return [binding.fileId, binding.kind, binding.connectionId, binding.grantId]
    .every((value) => typeof value === "string" && value.length > 0);
}

function isHexDigest(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

async function hashOriginalLinkToken(token: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))));
}

async function createOriginalLinkToken(): Promise<{ token: string; tokenHash: string }> {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  return { token, tokenHash: await hashOriginalLinkToken(token) };
}

async function matchesTokenHash(actualHash: string, storedHash: string): Promise<boolean> {
  if (!isHexDigest(storedHash)) return false;
  // Use native HMAC verification for constant-time comparison of the fixed-size
  // digests. The key is public because this only compares local values.
  const key = await crypto.subtle.importKey("raw", new Uint8Array(32), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  const encoder = new TextEncoder();
  const tag = await crypto.subtle.sign("HMAC", key, encoder.encode(storedHash));
  return crypto.subtle.verify("HMAC", key, tag, encoder.encode(actualHash));
}

/** Call only from the AI's explicit original request, with its authenticated binding. */
export async function issueOriginalLink(
  binding: OriginalLinkBinding,
  policy: OriginalLinkPolicy,
  store: (entry: StoredOriginalLink) => Promise<void>,
): Promise<{ url: string; expiresAt: number } | null> {
  const origin = ownOrigin(policy);
  if (!validBinding(binding)) return null;
  const now = policy.now ?? Date.now;
  const access = await policy.checkAccess(binding);
  if (!access) return null;

  const issuedAt = now();
  const expiresAt = Math.min(issuedAt + AI_ORIGINAL_LINK_TTL_SECONDS * 1000, access.grantExpiresAt ?? Infinity);
  if (!(issuedAt < expiresAt)) return null;
  const claims: OriginalLinkClaims = {
    fileId: binding.fileId, kind: binding.kind, connectionId: binding.connectionId, grantId: binding.grantId,
    purpose: "ai-media-original", origin, issuedAt, expiresAt,
  };
  const { token, tokenHash } = await createOriginalLinkToken();
  await store({ tokenHash, claims });
  return now() < expiresAt ? { url: origin + AI_ORIGINAL_LINK_PATH + token, expiresAt } : null;
}

/** Before streaming an original, authenticate the token and re-check its bound access. */
export async function checkOriginalLink(
  token: string,
  policy: OriginalLinkPolicy,
  load: (tokenHash: string) => Promise<StoredOriginalLink | null>,
): Promise<OriginalLinkClaims | null> {
  const origin = ownOrigin(policy);
  if (!isHexDigest(token)) return null;
  const tokenHash = await hashOriginalLinkToken(token);
  const entry = await load(tokenHash);
  if (!entry || !await matchesTokenHash(tokenHash, entry.tokenHash)) return null;
  const { claims } = entry;
  const now = policy.now ?? Date.now;
  const checkedAt = now();
  if (claims.purpose !== "ai-media-original" || claims.origin !== origin || !validBinding(claims) ||
      !Number.isSafeInteger(claims.issuedAt) || !Number.isSafeInteger(claims.expiresAt) ||
      claims.issuedAt > checkedAt + ORIGINAL_LINK_ISSUE_CLOCK_SKEW_MS ||
      claims.expiresAt <= checkedAt || claims.expiresAt <= claims.issuedAt ||
      claims.expiresAt - claims.issuedAt > AI_ORIGINAL_LINK_TTL_SECONDS * 1000) {
    return null;
  }
  const access = await policy.checkAccess(claims);
  return access && now() < Math.min(claims.expiresAt, access.grantExpiresAt ?? Infinity) ? claims : null;
}
