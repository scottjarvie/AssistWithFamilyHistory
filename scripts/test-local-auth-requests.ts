/**
 * Request-level tests for local Live / Sandbox authentication: the proxy and
 * the session POST handler, not just the token helpers. The public signing
 * keys are served by a stubbed JWKS fetch, so no network and no real Clerk
 * instance is involved.
 */
import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { NextRequest } from 'next/server';
import { LOCAL_CONVEX_COOKIE, LOCAL_LIVE_ISSUER, LOCAL_SANDBOX_ISSUER, localLiveProxy } from '../lib/localLiveAuth';
import { POST } from '../app/api/local-session/route';

const LIVE_ORIGIN = 'https://local.assistwithfamilyhistory.com';
const SANDBOX_ORIGIN = 'http://family-history.localhost:3443';
const LIVE_ENV = {
  NODE_ENV: 'development',
  LOCAL_DEVELOPMENT_MODE: 'live',
  CONVEX_DEPLOYMENT: 'prod:gallant-mallard-74',
  NEXT_PUBLIC_CONVEX_URL: 'https://gallant-mallard-74.convex.cloud',
};
const SANDBOX_ENV = {
  NODE_ENV: 'development',
  LOCAL_DEVELOPMENT_MODE: 'sandbox',
  CONVEX_DEPLOYMENT: 'anonymous:anonymous-family-history-completion-20261007',
  NEXT_PUBLIC_CONVEX_URL: 'http://127.0.0.1:4323',
};
const ENV_KEYS = ['NODE_ENV', 'LOCAL_DEVELOPMENT_MODE', 'CONVEX_DEPLOYMENT', 'NEXT_PUBLIC_CONVEX_URL', 'VERCEL', 'CI', 'CLERK_SECRET_KEY'] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const savedFetch = globalThis.fetch;

let pair: Awaited<ReturnType<typeof generateKeyPair>>;
const KID = 'synthetic-local-key';

function useEnv(values: Record<string, string>) {
  for (const key of ENV_KEYS) delete (process.env as Record<string, string | undefined>)[key];
  Object.assign(process.env, values);
}

const now = () => Math.floor(Date.now() / 1000);
function sign(claims: Record<string, unknown>, issuer = LOCAL_LIVE_ISSUER, origin = LIVE_ORIGIN) {
  return new SignJWT({ iss: issuer, sub: 'user_synthetic', sid: 'sess_synthetic', azp: origin, nbf: now() - 1, iat: now(), exp: now() + 120, ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: KID })
    .sign(pair.privateKey);
}
const session = (claims: Record<string, unknown> = {}, issuer?: string, origin?: string) => sign(claims, issuer, origin);
const convexToken = (claims: Record<string, unknown> = {}, issuer?: string, origin?: string) => sign({ aud: 'convex', sid: undefined, ...claims }, issuer, origin);

function sessionPost(input: { origin?: string; host?: string; cookie?: string; body?: string; url?: string }) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (input.origin) headers.set('origin', input.origin);
  headers.set('host', input.host ?? new URL(input.origin ?? LIVE_ORIGIN).host);
  if (input.cookie) headers.set('cookie', input.cookie);
  return new NextRequest(input.url ?? `${LIVE_ORIGIN}/api/local-session`, { method: 'POST', headers, body: input.body ?? '{}' });
}

function proxyRequest(url: string, input: { method?: string; origin?: string; host?: string; cookie?: string } = {}) {
  const headers = new Headers();
  headers.set('host', input.host ?? new URL(url).host);
  if (input.origin) headers.set('origin', input.origin);
  if (input.cookie) headers.set('cookie', input.cookie);
  return new NextRequest(url, { method: input.method ?? 'GET', headers });
}

before(async () => {
  pair = await generateKeyPair('RS256', { extractable: true });
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: KID, alg: 'RS256', use: 'sig' };
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url === `${LOCAL_LIVE_ISSUER}/.well-known/jwks.json` || url === `${LOCAL_SANDBOX_ISSUER}/.well-known/jwks.json`) {
      return Response.json({ keys: [jwk] });
    }
    throw new Error(`Unexpected fetch to ${url}`);
  }) as typeof fetch;
});

beforeEach(() => useEnv(LIVE_ENV));

after(() => {
  globalThis.fetch = savedFetch;
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete (process.env as Record<string, string | undefined>)[key];
    else (process.env as Record<string, string | undefined>)[key] = savedEnv[key];
  }
});

test('session POST is unavailable outside an exact local mode', async () => {
  for (const wrong of [{ NODE_ENV: 'production' }, { VERCEL: '1' }, { CI: '1' }, { CLERK_SECRET_KEY: 'placeholder' }, { NEXT_PUBLIC_CONVEX_URL: 'https://wrong.convex.cloud' }]) {
    useEnv({ ...LIVE_ENV, ...wrong });
    const response = await POST(sessionPost({ origin: LIVE_ORIGIN, cookie: `__session=${await session()}`, body: JSON.stringify({ token: await convexToken() }) }));
    assert.equal(response.status, 404, JSON.stringify(wrong));
    assert.equal(response.headers.get('set-cookie'), null);
  }
});

test('session POST refuses a foreign origin, a missing origin and a mismatched host', async () => {
  const body = JSON.stringify({ token: await convexToken() });
  const cookie = `__session=${await session()}`;
  for (const request of [
    sessionPost({ origin: 'https://attacker.example', host: 'local.assistwithfamilyhistory.com', cookie, body }),
    sessionPost({ cookie, body }),
    sessionPost({ origin: LIVE_ORIGIN, host: 'attacker.example', cookie, body }),
    sessionPost({ origin: 'http://localhost:3444', host: 'local.assistwithfamilyhistory.com', cookie, body }),
  ]) {
    const response = await POST(request);
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('set-cookie'), null);
  }
});

test('session POST refuses an oversized or malformed body', async () => {
  const cookie = `__session=${await session()}`;
  assert.equal((await POST(sessionPost({ origin: LIVE_ORIGIN, cookie, body: JSON.stringify({ token: 'x'.repeat(17_000) }) }))).status, 413);
  assert.equal((await POST(sessionPost({ origin: LIVE_ORIGIN, cookie, body: 'not json' }))).status, 400);
});

test('session POST refuses a missing session, a mismatched subject, a wrong audience and a forged key', async () => {
  const other = await generateKeyPair('RS256');
  const forged = await new SignJWT({ iss: LOCAL_LIVE_ISSUER, sub: 'user_synthetic', aud: 'convex', azp: LIVE_ORIGIN, nbf: now() - 1, iat: now(), exp: now() + 120 })
    .setProtectedHeader({ alg: 'RS256', kid: KID }).sign(other.privateKey);
  const cases: Array<[string | undefined, string]> = [
    [undefined, await convexToken()],
    [await session(), await convexToken({ sub: 'user_someone_else' })],
    [await session(), await convexToken({ aud: 'not-convex' })],
    [await session(), forged],
    [await session({ exp: now() - 10 }), await convexToken()],
    [await session(), 'not-a-jwt'],
  ];
  for (const [sessionToken, token] of cases) {
    const response = await POST(sessionPost({ origin: LIVE_ORIGIN, cookie: sessionToken ? `__session=${sessionToken}` : undefined, body: JSON.stringify({ token }) }));
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('set-cookie'), null);
  }
});

test('session POST issues a short-lived HttpOnly, SameSite=Strict backend cookie for the verified subject', async () => {
  const token = await convexToken({ exp: now() + 90 });
  const response = await POST(sessionPost({ origin: LIVE_ORIGIN, cookie: `__session=${await session()}`, body: JSON.stringify({ token }) }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const cookie = response.headers.get('set-cookie') ?? '';
  assert.match(cookie, new RegExp(`^${LOCAL_CONVEX_COOKIE}=${token.replace(/[.]/g, '\\.')};`));
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=strict/i);
  assert.match(cookie, /Secure/i);
  assert.match(cookie, /Path=\//);
  const maxAge = Number(/Max-Age=(\d+)/i.exec(cookie)?.[1]);
  assert.ok(maxAge >= 85 && maxAge <= 90, `max-age ${maxAge} follows the token's own expiry`);

  // A long-lived token is still capped at five minutes.
  const long = await POST(sessionPost({ origin: LIVE_ORIGIN, cookie: `__session=${await session()}`, body: JSON.stringify({ token: await convexToken({ exp: now() + 3600 }) }) }));
  assert.equal(Number(/Max-Age=(\d+)/i.exec(long.headers.get('set-cookie') ?? '')?.[1]), 300);

  // Plain-HTTP loopback origins get a cookie without Secure.
  const loopback = await POST(sessionPost({
    origin: 'http://127.0.0.1:3444', url: 'http://127.0.0.1:3444/api/local-session',
    cookie: `__session=${await session({ azp: 'http://127.0.0.1:3444' })}`,
    body: JSON.stringify({ token: await convexToken({ azp: 'http://127.0.0.1:3444' }) }),
  }));
  assert.equal(loopback.status, 200);
  assert.doesNotMatch(loopback.headers.get('set-cookie') ?? '', /Secure/i);
});

test('Sandbox session POST accepts only the Sandbox issuer on its dedicated host', async () => {
  useEnv(SANDBOX_ENV);
  const sandboxSession = await session({}, LOCAL_SANDBOX_ISSUER, SANDBOX_ORIGIN);
  const sandboxToken = await convexToken({}, LOCAL_SANDBOX_ISSUER, SANDBOX_ORIGIN);
  const ok = await POST(sessionPost({ origin: SANDBOX_ORIGIN, url: `${SANDBOX_ORIGIN}/api/local-session`, cookie: `__session=${sandboxSession}`, body: JSON.stringify({ token: sandboxToken }) }));
  assert.equal(ok.status, 200);
  assert.doesNotMatch(ok.headers.get('set-cookie') ?? '', /Secure/i);
  // A production Live session is never a Sandbox identity.
  const live = await POST(sessionPost({ origin: SANDBOX_ORIGIN, url: `${SANDBOX_ORIGIN}/api/local-session`, cookie: `__session=${await session()}`, body: JSON.stringify({ token: await convexToken() }) }));
  assert.equal(live.status, 401);
  // The Live origin is not a Sandbox origin.
  assert.equal((await POST(sessionPost({ origin: LIVE_ORIGIN, cookie: `__session=${sandboxSession}`, body: JSON.stringify({ token: sandboxToken }) }))).status, 403);
});

test('proxy accepts only its configured host and same-origin API writes', async () => {
  assert.equal((await localLiveProxy(proxyRequest(`${LIVE_ORIGIN}/app/people`, { host: 'attacker.example' }))).status, 403);
  const foreignWrite = await localLiveProxy(proxyRequest(`${LIVE_ORIGIN}/api/people`, { method: 'POST', origin: 'https://attacker.example' }));
  assert.equal(foreignWrite.status, 403);
  const noOriginWrite = await localLiveProxy(proxyRequest(`${LIVE_ORIGIN}/api/people`, { method: 'POST' }));
  assert.equal(noOriginWrite.status, 403);
});

test('proxy withholds provider, media, import, MCP, admin and AI-settings routes', async () => {
  for (const path of ['/api/media/abc/file', '/api/imports', '/mcp', '/admin', '/api/process', '/api/people/abc/other']) {
    const response = await localLiveProxy(proxyRequest(`${LIVE_ORIGIN}${path}`));
    assert.equal(response.status, 503, path);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
  }
  for (const path of ['/app/settings/ai', '/app/api/anything']) {
    assert.equal((await localLiveProxy(proxyRequest(`${LIVE_ORIGIN}${path}`))).status, 503, path);
  }
});

test('proxy sends a private page to sign-in, then to the backend bridge, then through', async () => {
  const signedOut = await localLiveProxy(proxyRequest(`${LIVE_ORIGIN}/app/people?q=ada`));
  assert.equal(signedOut.status, 307);
  assert.equal(new URL(signedOut.headers.get('location')!).pathname, '/sign-in');
  assert.equal(new URL(signedOut.headers.get('location')!).search, '');
  assert.equal(signedOut.headers.get('cache-control'), 'private, no-store');

  const sessionCookie = `__session=${await session()}`;
  const noBackend = await localLiveProxy(proxyRequest(`${LIVE_ORIGIN}/app/people?q=ada`, { cookie: sessionCookie }));
  assert.equal(noBackend.status, 307);
  const bridge = new URL(noBackend.headers.get('location')!);
  assert.equal(bridge.pathname, '/local-session');
  assert.equal(bridge.searchParams.get('returnTo'), '/app/people?q=ada');

  // A backend cookie for a different subject does not count.
  const mismatched = await localLiveProxy(proxyRequest(`${LIVE_ORIGIN}/app/people`, { cookie: `${sessionCookie}; ${LOCAL_CONVEX_COOKIE}=${await convexToken({ sub: 'user_other' })}` }));
  assert.equal(new URL(mismatched.headers.get('location')!).pathname, '/local-session');

  const through = await localLiveProxy(proxyRequest(`${LIVE_ORIGIN}/app/people`, { cookie: `${sessionCookie}; ${LOCAL_CONVEX_COOKIE}=${await convexToken()}` }));
  assert.equal(through.headers.get('location'), null);
  assert.equal(through.headers.get('x-middleware-next'), '1');
  assert.equal(through.headers.get('cache-control'), 'private, no-store');
});

test('Sandbox proxy moves shared localhost to its dedicated host and refuses writes there', async () => {
  useEnv(SANDBOX_ENV);
  const moved = await localLiveProxy(proxyRequest('http://localhost:3443/app/people?q=ada'));
  assert.equal(moved.status, 307);
  const target = new URL(moved.headers.get('location')!);
  assert.equal(target.host, 'family-history.localhost:3443');
  assert.equal(target.pathname + target.search, '/app/people?q=ada');
  assert.equal((await localLiveProxy(proxyRequest('http://127.0.0.1:3443/api/people', { method: 'POST', origin: 'http://127.0.0.1:3443' }))).status, 421);
  // The Live host is not a Sandbox host.
  assert.equal((await localLiveProxy(proxyRequest(`${LIVE_ORIGIN}/app/people`))).status, 403);
});
