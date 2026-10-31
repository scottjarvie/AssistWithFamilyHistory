const VAULT_PAGE_READ_METHODS = new Set(["GET", "HEAD"]);

/**
 * Public pages link into the vault. A signed-out read of one of those pages
 * should reach Clerk sign-in and come back here afterwards.
 *
 * `auth.protect()` only redirects requests it classifies as documents. Any
 * other signed-out request, including curl and some app-router fetches, is
 * rewritten to a 404 (`protect-rewrite`).
 * These helpers cover every read of a vault page, not only document requests.
 * Writes and non-page routes stay on `auth.protect()`.
 */
export function isVaultPageRead(pathname: string, method: string) {
  return (
    VAULT_PAGE_READ_METHODS.has(method.toUpperCase()) &&
    (pathname === "/app" || pathname.startsWith("/app/"))
  );
}

export function signedOutVaultSignInLocation(current: URL) {
  const signIn = new URL("/sign-in", current.origin);
  const returnTo = new URL(current.pathname + current.search, current.origin);
  signIn.searchParams.set("redirect_url", returnTo.toString());
  return signIn;
}
