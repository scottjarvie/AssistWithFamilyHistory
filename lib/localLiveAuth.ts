import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { NextResponse, type NextRequest } from "next/server";
const PRIVATE_CACHE_CONTROL = "private, no-store";
const isPrivatePath = (pathname: string) => /^\/(?:app)(?:\/|$)/.test(pathname);

// Public verification material belongs to this site's production Clerk instance.
// Never infer an issuer or fetch URL from an unverified token.
export const LOCAL_LIVE_ISSUER = "https://clerk.assistwithfamilyhistory.com";
export const LOCAL_LIVE_ORIGINS = [
  "https://local.assistwithfamilyhistory.com",
  "http://127.0.0.1:3444",
  "http://localhost:3444",
] as const;
const publicKeys = createRemoteJWKSet(new URL(`${LOCAL_LIVE_ISSUER}/.well-known/jwks.json`), { timeoutDuration: 5000 });

export const LOCAL_SANDBOX_ISSUER = "https://improved-ram-86.clerk.accounts.dev";
export const LOCAL_SANDBOX_ORIGINS = ["http://family-history.localhost:3443"] as const;
const sandboxPublicKeys = createRemoteJWKSet(new URL(`${LOCAL_SANDBOX_ISSUER}/.well-known/jwks.json`), { timeoutDuration: 5000 });
export function localSandboxEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV === "development" && env.LOCAL_DEVELOPMENT_MODE === "sandbox"
    && !env.VERCEL && !env.CI && !env.CLERK_SECRET_KEY
    && env.CONVEX_DEPLOYMENT === "anonymous:anonymous-family-history-completion-20261007"
    && env.NEXT_PUBLIC_CONVEX_URL === "http://127.0.0.1:4323";
}
export function localPublicAuthEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return localLiveEnabled(env) || localSandboxEnabled(env);
}

export function localLiveEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV === "development" && env.LOCAL_DEVELOPMENT_MODE === "live"
    && !env.VERCEL && !env.CI && !env.CLERK_SECRET_KEY
    && env.CONVEX_DEPLOYMENT === "prod:gallant-mallard-74"
    && env.NEXT_PUBLIC_CONVEX_URL === "https://gallant-mallard-74.convex.cloud";
}

/** Clerk's documented manual session verification. Convex separately verifies
 * its own audience-specific token and enforces ownership for every record. */
export async function verifyLocalSession(token: string | undefined, keys: JWTVerifyGetKey = localSandboxEnabled() ? sandboxPublicKeys : publicKeys, mode: "live" | "sandbox" = localSandboxEnabled() ? "sandbox" : "live") {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, keys, {
      algorithms: ["RS256"], issuer: mode === "sandbox" ? LOCAL_SANDBOX_ISSUER : LOCAL_LIVE_ISSUER,
      requiredClaims: ["exp", "nbf", "iat", "sub", "sid", "azp"],
    });
    if (typeof payload.sub !== "string" || !payload.sub.startsWith("user_")
      || typeof payload.sid !== "string" || !payload.sid.startsWith("sess_")
      || !(mode === "sandbox" ? LOCAL_SANDBOX_ORIGINS : LOCAL_LIVE_ORIGINS).some(origin => origin === payload.azp)
      || payload.sts === "pending") return null;
    return { userId: payload.sub, sessionId: payload.sid };
  } catch {
    return null;
  }
}

export async function localLiveProxy(request: NextRequest) {
  const host = request.headers.get("host");
  // Ports share cookies; each Sandbox uses a distinct local hostname.
  if (localSandboxEnabled() && ["localhost:3443", "127.0.0.1:3443"].includes(host ?? "")) {
    if (!["GET", "HEAD"].includes(request.method)) return new NextResponse("Use the dedicated Sandbox host", { status: 421 });
    const target=request.nextUrl.clone();target.hostname="family-history.localhost";target.port="3443";
    return NextResponse.redirect(target,{headers:{"Cache-Control":PRIVATE_CACHE_CONTROL}});
  }
  if (!(localSandboxEnabled() ? LOCAL_SANDBOX_ORIGINS : LOCAL_LIVE_ORIGINS).some(origin => new URL(origin).host === host)) {
    return new NextResponse("Local Live accepts only its configured local host.", { status: 403 });
  }
  if (!["GET", "HEAD"].includes(request.method) && request.nextUrl.pathname.startsWith("/api/")
    && !(localSandboxEnabled() ? LOCAL_SANDBOX_ORIGINS : LOCAL_LIVE_ORIGINS).some(origin => origin === request.headers.get("origin"))) {
    return new NextResponse("Local write origin rejected", {status:403});
  }
  // This server operation needs Clerk's administrative API, not just a session
  // signature. Do not emulate it or fetch a production administrative secret.
  if (/^\/(?:api|mcp|admin)(?:\/|$)/.test(request.nextUrl.pathname) && !/^\/api\/(?:local-session|first-start|people(?:\/[^/]+(?:\/context-pack)?)?|operations\/(?:queue|tasks|provisional|checks)|queue(?:\/[^/]+)?|context-items|context-reports)$/.test(request.nextUrl.pathname)) {
    return new NextResponse("Local provider, media, import and administration routes are unavailable.", {
      status: 503, headers: { "Cache-Control": PRIVATE_CACHE_CONTROL },
    });
  }
  if (/^\/app\/(?:api(?:\/|$)|settings\/ai(?:\/|$))/.test(request.nextUrl.pathname)) return new NextResponse("Local administrative and AI connection settings unavailable", {status:503,headers:{"Cache-Control":PRIVATE_CACHE_CONTROL}});
  if (isPrivatePath(request.nextUrl.pathname)) {
    const verified = await verifyLocalSession(request.cookies.get("__session")?.value);
    if (!verified) {
      const url = request.nextUrl.clone();
      url.pathname = "/sign-in";
      url.search = "";
      return NextResponse.redirect(url, { headers: { "Cache-Control": PRIVATE_CACHE_CONTROL } });
    }
  }
  if (isPrivatePath(request.nextUrl.pathname)) {
    const session = await verifyLocalSession(request.cookies.get("__session")?.value);
    const backendToken = await verifyLocalConvexToken(request.cookies.get(LOCAL_CONVEX_COOKIE)?.value, session);
    if (!backendToken) {
      const url = request.nextUrl.clone(); url.pathname = "/local-session";
      url.search = ""; url.searchParams.set("returnTo", request.nextUrl.pathname + request.nextUrl.search);
      return NextResponse.redirect(url, {headers:{"Cache-Control":PRIVATE_CACHE_CONTROL}});
    }
  }
  const response = NextResponse.next();
  response.headers.set("Cache-Control", PRIVATE_CACHE_CONTROL);
  return response;
}

export const LOCAL_CONVEX_COOKIE = "awf_local_convex";
export async function verifyLocalConvexToken(token: string | undefined, session: {userId:string;sessionId:string} | null, keys: JWTVerifyGetKey = localSandboxEnabled() ? sandboxPublicKeys : publicKeys, mode: "live" | "sandbox" = localSandboxEnabled() ? "sandbox" : "live") {
 if (!token || !session) return null;
 try {
  const {payload}=await jwtVerify(token,keys,{algorithms:["RS256"],issuer:mode==="sandbox"?LOCAL_SANDBOX_ISSUER:LOCAL_LIVE_ISSUER,audience:"convex",requiredClaims:["exp","nbf","iat","sub"]});
  if (payload.sub!==session.userId || payload.sts==="pending") return null;
  if (payload.azp!==undefined && !(mode==="sandbox"?LOCAL_SANDBOX_ORIGINS:LOCAL_LIVE_ORIGINS).some(origin=>origin===payload.azp)) return null;
  return {token,expiresAt:payload.exp!};
 } catch {return null;}
}
