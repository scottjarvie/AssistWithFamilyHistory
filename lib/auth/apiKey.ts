/**
 * API-key secret generation, hashing, and parsing.
 *
 * SERVER-ONLY (uses node:crypto) — import only from Next API routes / server
 * code, never from Convex functions or client components.
 *
 * Key shape:  `<keyId>.<secret>`  e.g.  `dts_live_a1b2c3d4e5f6.<43-char-secret>`
 *   - keyId  : public, loggable prefix stored in the apiKeys row.
 *   - secret : shown to the user ONCE at mint; only SHA-256(secret) is stored.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const API_KEY_PREFIX = "dts_live_";
const KEY_DELIMITER = ".";

export interface GeneratedApiKey {
  keyId: string;
  secret: string;
  /** The full token shown to the user exactly once. */
  fullKey: string;
  /** SHA-256(secret) hex — the only thing persisted. */
  hashedSecret: string;
}

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function generateApiKey(): GeneratedApiKey {
  const keyId = `${API_KEY_PREFIX}${randomBytes(6).toString("hex")}`;
  const secret = randomBytes(32).toString("base64url");
  return {
    keyId,
    secret,
    fullKey: `${keyId}${KEY_DELIMITER}${secret}`,
    hashedSecret: hashSecret(secret),
  };
}

/**
 * Parse an incoming credential into its keyId + secret. Accepts a raw token or
 * an `Authorization: Bearer <token>` header value. Returns null if it isn't a
 * well-formed DTS key.
 */
export function parseApiKey(raw: string | null | undefined): { keyId: string; secret: string } | null {
  if (!raw) return null;
  const token = raw.startsWith("Bearer ") ? raw.slice(7).trim() : raw.trim();
  if (!token.startsWith(API_KEY_PREFIX)) return null;
  const delimiterIndex = token.indexOf(KEY_DELIMITER);
  if (delimiterIndex <= API_KEY_PREFIX.length || delimiterIndex >= token.length - 1) return null;
  return {
    keyId: token.slice(0, delimiterIndex),
    secret: token.slice(delimiterIndex + 1),
  };
}

/** Constant-time comparison of a presented secret against a stored hash. */
export function secretMatchesHash(presentedSecret: string, storedHash: string): boolean {
  const presentedHash = hashSecret(presentedSecret);
  if (presentedHash.length !== storedHash.length) return false;
  return timingSafeEqual(Buffer.from(presentedHash), Buffer.from(storedHash));
}
