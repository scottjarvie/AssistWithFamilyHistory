/**
 * Behavioral unit tests for the pure agent-auth helpers: scope vocabulary/presets
 * and API-key generation/parsing/hashing. Run via the `pnpm test` suite.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SCOPE_PRESETS,
  hasScope,
  isScopePreset,
  isValidScope,
  presetScopes,
  sanitizeScopes,
} from "@/lib/auth/scopes";
import {
  API_KEY_PREFIX,
  generateApiKey,
  hashSecret,
  parseApiKey,
  secretMatchesHash,
} from "@/lib/auth/apiKey";

test("scope presets are valid and read_only_assistant has no write scopes", () => {
  assert.equal(isScopePreset("read_only_assistant"), true);
  assert.equal(isScopePreset("nope"), false);
  for (const scopes of Object.values(SCOPE_PRESETS)) {
    for (const scope of scopes) assert.equal(isValidScope(scope), true);
  }
  assert.equal(presetScopes("read_only_assistant").some((s) => s.includes(":write")), false);
  assert.equal(hasScope(presetScopes("trusted_operator"), "stories:publish"), true);
  assert.equal(hasScope(presetScopes("read_only_assistant"), "stories:publish"), false);
});

test("sanitizeScopes drops unknown scopes", () => {
  assert.deepEqual(sanitizeScopes(["people:read", "made:up", "tasks:write"]), [
    "people:read",
    "tasks:write",
  ]);
});

test("generated keys round-trip through parse + hash verification", () => {
  const key = generateApiKey();
  assert.ok(key.keyId.startsWith(API_KEY_PREFIX));
  assert.ok(key.fullKey.startsWith(key.keyId + "."));
  assert.equal(key.hashedSecret, hashSecret(key.secret));

  const parsed = parseApiKey(`Bearer ${key.fullKey}`);
  assert.ok(parsed);
  assert.equal(parsed!.keyId, key.keyId);
  assert.equal(parsed!.secret, key.secret);
  assert.equal(secretMatchesHash(parsed!.secret, key.hashedSecret), true);
  assert.equal(secretMatchesHash("wrong-secret", key.hashedSecret), false);
});

test("parseApiKey rejects malformed tokens", () => {
  assert.equal(parseApiKey(null), null);
  assert.equal(parseApiKey("random-token"), null);
  assert.equal(parseApiKey("dts_live_abc"), null); // no secret segment
  assert.equal(parseApiKey(`${API_KEY_PREFIX}abc.`), null); // empty secret
});

test("two generated keys differ", () => {
  assert.notEqual(generateApiKey().fullKey, generateApiKey().fullKey);
});
