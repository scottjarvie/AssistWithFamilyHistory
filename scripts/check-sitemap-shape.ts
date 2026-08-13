/**
 * Sitemap / robots URL-shape contract (GEN-80).
 *
 * Behavioral: imports the real `normalizeSiteUrl` helper and the real
 * `sitemap()` / `robots()` route generators, then asserts that no emitted URL
 * can ever contain whitespace and that every entry is a parseable absolute URL
 * rooted at SITE_URL.
 *
 * Why this exists: production `NEXT_PUBLIC_SITE_URL` carried a trailing newline,
 * so `${SITE_URL}${route}` produced `https://host\n/about` — a literal newline
 * inside sitemap `<loc>` values, which the sitemap spec forbids and strict
 * search engines reject. A pure trailing-slash strip did not catch it. This
 * check pins the whitespace-free contract so the regression cannot return
 * silently.
 */

import sitemap from "../app/sitemap";
import robots from "../app/robots";
import { normalizeSiteUrl, SITE_URL } from "../lib/site";

const failures: string[] = [];

function isAbsoluteUrl(value: string): boolean {
  try {
    // eslint-disable-next-line no-new
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

// -- 1. Behavioral: normalizeSiteUrl strips all whitespace + trailing slashes --
const normalizeCases: Array<[string, string]> = [
  ["https://assistwithfamilyhistory.com\n", "https://assistwithfamilyhistory.com"],
  ["https://assistwithfamilyhistory.com/\n", "https://assistwithfamilyhistory.com"],
  ["https://assistwithfamilyhistory.com/", "https://assistwithfamilyhistory.com"],
  ["  https://assistwithfamilyhistory.com  ", "https://assistwithfamilyhistory.com"],
  ["https://assistwithfamilyhistory.com\r\n", "https://assistwithfamilyhistory.com"],
];

for (const [input, expected] of normalizeCases) {
  const actual = normalizeSiteUrl(input);
  if (actual !== expected) {
    failures.push(
      `normalizeSiteUrl(${JSON.stringify(input)}) should be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

// Empty / whitespace-only env must fall back to a usable default, never "".
if (!normalizeSiteUrl("").length || /\s/.test(normalizeSiteUrl(""))) {
  failures.push("normalizeSiteUrl(\"\") must return a non-empty, whitespace-free default");
}

// -- 2. Live output: every sitemap <loc> is whitespace-free and parseable -----
const sitemapEntries = sitemap();

if (sitemapEntries.length === 0) {
  failures.push("sitemap() returned no entries");
}

for (const entry of sitemapEntries) {
  const url = String(entry.url);
  if (/\s/.test(url)) {
    failures.push(`sitemap <loc> contains whitespace: ${JSON.stringify(url)}`);
  }
  if (!isAbsoluteUrl(url)) {
    failures.push(`sitemap <loc> is not a valid absolute URL: ${JSON.stringify(url)}`);
  }
  if (!url.startsWith(SITE_URL)) {
    failures.push(`sitemap <loc> is not rooted at SITE_URL (${SITE_URL}): ${JSON.stringify(url)}`);
  }
}

// -- 3. robots.txt sitemap reference is also whitespace-free + parseable -------
const robotsResult = robots();
const robotsSitemaps = Array.isArray(robotsResult.sitemap)
  ? robotsResult.sitemap
  : robotsResult.sitemap
    ? [robotsResult.sitemap]
    : [];

for (const url of robotsSitemaps) {
  if (/\s/.test(url)) {
    failures.push(`robots sitemap URL contains whitespace: ${JSON.stringify(url)}`);
  }
  if (!isAbsoluteUrl(url)) {
    failures.push(`robots sitemap URL is not a valid absolute URL: ${JSON.stringify(url)}`);
  }
}

if (failures.length > 0) {
  console.error("Sitemap/robots URL-shape assertions failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Sitemap/robots URL-shape assertions passed");
