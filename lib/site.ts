const defaultSiteUrl = "http://127.0.0.1:3443";

export const SITE_NAME = "Assist With Family History";
export const SITE_DESCRIPTION =
  "A durable, user-controlled family-history workspace where your AI can work with connected evidence and context and you can correct and shape source-aware stories.";

/**
 * Normalize a configured site URL into a safe origin: no internal or trailing
 * whitespace, and no trailing slash.
 *
 * GEN-80: production `NEXT_PUBLIC_SITE_URL` carried a trailing newline, so
 * `${SITE_URL}${route}` produced `https://host\n/about` — a literal newline
 * inside sitemap `<loc>` values, which strict search engines reject. The prior
 * implementation only stripped trailing slashes, leaving the whitespace intact.
 * A URL never legitimately contains whitespace, so we strip all of it before
 * removing trailing slashes, and fall back to the default if nothing remains.
 */
export function normalizeSiteUrl(raw: string | undefined | null): string {
  const cleaned = (raw ?? "").replace(/\s+/g, "").replace(/\/+$/, "");
  return cleaned || defaultSiteUrl;
}

export const SITE_URL = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL || defaultSiteUrl);
