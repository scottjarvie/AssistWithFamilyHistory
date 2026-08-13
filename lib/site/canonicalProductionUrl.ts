const CANONICAL_PRODUCTION_HOST = "discovertheirstories.com";

const PRODUCTION_REDIRECT_HOSTS = new Set([
  "assistwithfamilyhistory.com",
  "tell-their-stories.vercel.app",
  "tell-their-stories-jarvies-projects.vercel.app",
  "tell-their-stories-jarvie-jarvies-projects.vercel.app",
]);

/**
 * Keep every production alias on the one origin authorized by Clerk.
 *
 * This runs before Clerk middleware so an alias can never attempt to load the
 * canonical production publishable key from an unapproved browser origin.
 */
export function canonicalizeProductionUrl(requestUrl: string) {
  const canonicalUrl = new URL(requestUrl);

  if (!PRODUCTION_REDIRECT_HOSTS.has(canonicalUrl.hostname.toLowerCase())) {
    return null;
  }

  canonicalUrl.protocol = "https:";
  canonicalUrl.host = CANONICAL_PRODUCTION_HOST;

  const redirectTarget = canonicalUrl.searchParams.get("redirect_url");
  if (redirectTarget) {
    try {
      const nestedUrl = new URL(redirectTarget);
      if (PRODUCTION_REDIRECT_HOSTS.has(nestedUrl.hostname.toLowerCase())) {
        nestedUrl.protocol = "https:";
        nestedUrl.host = CANONICAL_PRODUCTION_HOST;
        canonicalUrl.searchParams.set("redirect_url", nestedUrl.toString());
      }
    } catch {
      // Leave relative or malformed targets untouched for the owning route.
    }
  }

  return canonicalUrl;
}
