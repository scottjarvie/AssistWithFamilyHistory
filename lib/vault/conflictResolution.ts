/**
 * Source-fact conflict resolution policy.
 *
 * A conflict is two records disagreeing about a fact — a census says 1847, a
 * headstone says 1849. The vault could enter that state and never leave it:
 * `sourceFacts.status` could be set to `"conflict"` by the FamilySearch
 * importer or by a connected AI, and nothing anywhere could set it to anything
 * else again. This module holds the rules for the closing move so they are
 * unit-testable without a Convex runtime, matching the pattern of
 * `lib/operations/taskLifecycle.ts`.
 *
 * Two rules, and the second one is the important one.
 *
 * 1. A person may settle a conflict, with a real reason written down. The
 *    reading they decided against is kept, never deleted — genealogical
 *    practice is that you do not discard the record you rejected, because a
 *    reader a year from now needs to see what was weighed.
 *
 * 2. A connected AI may not settle one. Deciding which record to believe is the
 *    researcher's judgment call, and the consent screen already promises the
 *    person that this permission is "Proposals only. It cannot accept a
 *    conclusion for you" (`lib/mcp/catalog.ts`). An AI may read the conflict,
 *    gather evidence, and propose an answer on the `conflict_resolution`
 *    research task. The person confirms it. Card AWF-0046 records the open
 *    product decision about whether that line should ever move.
 */

/** What a settled conflict resolves to. The row is never deleted. */
export type ConflictResolution = "accepted" | "rejected";

export type SourceFactStatus = "candidate" | "accepted" | "conflict" | "rejected";

/**
 * Minimum length of the reason a person must write to settle a conflict.
 * Mirrors the `TASK_DONE_NOTES_MIN` floor and the provisional-relative review
 * note, so a resolved conflict always carries a real account of the judgment
 * rather than an empty click.
 */
export const CONFLICT_REASON_MIN = 20;

export type ConflictResolutionRequest = {
  currentStatus: SourceFactStatus;
  resolution: ConflictResolution;
  reason: string;
};

export type ConflictResolutionVerdict =
  | { allowed: true; reason: string }
  | { allowed: false; message: string };

/** Owner-side check: may this person settle this fact, with this reason? */
export function assessConflictResolution(
  request: ConflictResolutionRequest
): ConflictResolutionVerdict {
  if (request.currentStatus !== "conflict") {
    return {
      allowed: false,
      message: `Only a fact currently flagged as a conflict can be resolved; this one is "${request.currentStatus}".`,
    };
  }
  const reason = request.reason.trim();
  if (reason.length < CONFLICT_REASON_MIN) {
    return {
      allowed: false,
      message: `Recording which record you believed needs a reason of at least ${CONFLICT_REASON_MIN} characters, so a reader a year from now can see why.`,
    };
  }
  return { allowed: true, reason };
}

/**
 * AI-side check: may a connected AI's write move this fact to this status?
 *
 * Everything is permitted except the one move that is the resolution itself.
 * An AI may still flag a new conflict, correct a candidate, and update any
 * other field on a conflicting fact — it may only not take the fact out of
 * conflict, because that is the person's decision to make.
 */
export function mayAiSetSourceFactStatus(
  currentStatus: SourceFactStatus | undefined,
  nextStatus: SourceFactStatus
): boolean {
  if (currentStatus !== "conflict") return true;
  return nextStatus === "conflict";
}

/**
 * The reading this vault currently concludes for a fact type — the other side
 * of the disagreement.
 *
 * The FamilySearch importer flags a conflict by comparing an indexed source
 * field against the capture header for name, birth, and death only
 * (`lib/familysearch/sourceFacts.ts` findSourceFactConflicts), and those three
 * are exactly the fields that live on the person record. Any other fact type
 * has no canonical counterpart, so this returns undefined rather than a guess.
 *
 * Shared by the AI context pack, the person workspace, and the resolve
 * mutation so all three show the person the same "vault reads" value.
 */
export type CanonicalReadingPerson = {
  displayName?: string;
  birth?: { date?: { original?: string } };
  death?: { date?: { original?: string } };
};

export function canonicalReadingForFactType(
  person: CanonicalReadingPerson,
  factType: string
): string | undefined {
  if (factType === "name") return person.displayName || undefined;
  if (factType === "birth") return person.birth?.date?.original || undefined;
  if (factType === "death") return person.death?.date?.original || undefined;
  return undefined;
}

/** The durable research-log summary for a settled conflict. */
export function describeConflictResolution(input: {
  factType: string;
  label: string;
  sourceReading: string;
  canonicalReading?: string;
  resolution: ConflictResolution;
}) {
  const believed =
    input.resolution === "accepted"
      ? `believed the source reading "${input.sourceReading}"`
      : `believed the existing reading "${input.canonicalReading || "already recorded in this vault"}" over the source reading "${input.sourceReading}"`;
  return `Resolved a ${input.factType} conflict (${input.label}): ${believed}.`;
}
