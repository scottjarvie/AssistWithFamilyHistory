/**
 * GEN-79: error handling for the public, anonymous `/stories/<id>` route.
 *
 * The public story page cannot render without a published-story bundle, and it
 * must never surface a 500 error page to anonymous visitors. The 2026-05-25
 * production privacy sweep found that nonexistent slugs returned `500` instead
 * of `404`: a Convex deploy desync threw `"Could not find function ..."`, whose
 * message the old catch regex missed and whose runtime status was `503`, so the
 * route rethrew and Next rendered its generic 500 page.
 *
 * The route now degrades *every* error to `notFound()`. This classifier only
 * decides whether the error is a *known* bad-identifier / not-found shape (a
 * quiet 404 — bots probe garbage slugs constantly) versus something unexpected
 * (still a 404, but logged loudly so a genuine outage stays observable).
 *
 * Kept dependency-free on purpose so it is unit-testable under `node --test`
 * without pulling in the Convex/Clerk server import graph.
 */

/**
 * Error messages that unambiguously mean "the caller asked for a story that
 * cannot exist" — a malformed identifier or a not-found document. These are a
 * routine, quiet 404. Note: Convex *deployment* failures (e.g. "Could not find
 * function") are deliberately NOT listed here so they fall through to the
 * loud-log path.
 */
const KNOWN_NOT_FOUND =
  /ArgumentValidationError|Value does not match validator|Invalid id|NotFoundError|Document (not found|does not exist)/i;

export interface PublicStoryErrorDisposition {
  /**
   * True when the error is a known bad-identifier / not-found shape and can be
   * treated as a quiet 404. False means "unexpected" — the caller should log it
   * before degrading to 404.
   */
  recognized: boolean;
  /** Short, stable reason string for server-side observability. */
  reason: string;
}

/**
 * Classify an error thrown while resolving a published story for the public
 * route. The public route always ends in `notFound()`; this only distinguishes
 * quiet-404 from log-then-404.
 */
export function classifyPublicStoryError(error: unknown): PublicStoryErrorDisposition {
  const message = error instanceof Error ? error.message : "";
  if (KNOWN_NOT_FOUND.test(message)) {
    return { recognized: true, reason: "known-not-found" };
  }
  return { recognized: false, reason: "unexpected" };
}
