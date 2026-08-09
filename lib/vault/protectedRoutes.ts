export const PROTECTED_ROUTE_PATTERNS = [
  "/app(.*)",
  "/api/people(.*)",
  "/api/import(.*)",
  "/api/process(.*)",
  "/api/capabilities(.*)",
  "/api/convex(.*)",
  "/api/operations(.*)",
  "/api/queue(.*)",
  "/api/stories(.*)",
  "/api/context-reports(.*)",
  "/api/context-items(.*)",
  "/api/media(.*)",
  "/api/vault(.*)",
  "/api/keys(.*)",
] as const;

const PROTECTED_PATH_PREFIXES = [
  "/app",
  "/api/people",
  "/api/import",
  "/api/process",
  "/api/capabilities",
  "/api/convex",
  "/api/operations",
  "/api/queue",
  "/api/stories",
  "/api/context-reports",
  "/api/context-items",
  "/api/media",
  "/api/vault",
  "/api/keys",
] as const;

export function isProtectedAppPath(pathname: string) {
  return PROTECTED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}
