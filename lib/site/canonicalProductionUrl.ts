const CANONICAL_PRODUCTION_HOST = "assistwithfamilyhistory.com";

const PRODUCTION_REDIRECT_HOSTS = new Set([
  "discovertheirstories.com",
  "tell-their-stories.vercel.app",
  "tell-their-stories-jarvies-projects.vercel.app",
  "tell-their-stories-jarvie-jarvies-projects.vercel.app",
]);

/**
 * Keep legacy production addresses on the enduring Family History origin.
 *
 * This runs before Clerk middleware so old bookmarks and provider redirect
 * targets cannot leave the retired product name in the browser address bar.
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
