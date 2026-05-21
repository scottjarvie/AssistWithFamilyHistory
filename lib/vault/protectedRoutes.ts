export const PROTECTED_ROUTE_PATTERNS = [
  "/app(.*)",
  "/api/people(.*)",
  "/api/import(.*)",
  "/api/process(.*)",
  "/api/capabilities(.*)",
  "/api/convex(.*)",
  "/api/operations(.*)",
  "/api/stories(.*)",
  "/api/context-reports(.*)",
] as const;

const PROTECTED_PATH_PREFIXES = [
  "/app",
  "/api/people",
  "/api/import",
  "/api/process",
  "/api/capabilities",
  "/api/convex",
  "/api/operations",
  "/api/stories",
  "/api/context-reports",
] as const;

export function isProtectedAppPath(pathname: string) {
  return PROTECTED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}
