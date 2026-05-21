import type { StoryPublishReadiness, StoryPublishSafetyInput } from "./publishSafety";

type StoryHandoffInput = StoryPublishSafetyInput & {
  publishReadiness: StoryPublishReadiness;
};

export type StoryHandoffPacket = {
  packetType: "story_review_handoff";
  story: {
    title?: string;
    status: StoryPublishSafetyInput["story"]["status"];
    contentCharacters: number;
  };
  person: {
    displayName: string;
    livingRisk: boolean;
  };
  recommendedAgent: "story_writer" | "researcher" | "reviewer" | "trusted_publisher";
  publishReadiness: Pick<
    StoryPublishReadiness,
    "canPublish" | "status" | "score" | "summary" | "provenance" | "recommendedNextActions"
  >;
  blockers: StoryPublishReadiness["blockers"];
  warnings: StoryPublishReadiness["warnings"];
  writerInstructions: string[];
  reviewerInstructions: string[];
};

function hasBlocker(input: StoryPublishReadiness, key: string) {
  return input.blockers.some((blocker) => blocker.key === key);
}

function chooseRecommendedAgent(readiness: StoryPublishReadiness): StoryHandoffPacket["recommendedAgent"] {
  if (hasBlocker(readiness, "story_context_strength")) return "story_writer";
  if (hasBlocker(readiness, "evidence") || hasBlocker(readiness, "context")) return "researcher";
  if (hasBlocker(readiness, "provisional_relatives") || hasBlocker(readiness, "review_status")) return "reviewer";
  if (hasBlocker(readiness, "privacy_living_status")) return "trusted_publisher";
  return readiness.canPublish ? "trusted_publisher" : "reviewer";
}

export function buildStoryHandoffPacket(input: StoryHandoffInput): StoryHandoffPacket {
  const livingRisk = input.publishReadiness.blockers.some(
    (blocker) => blocker.key === "privacy_living_status"
  );

  return {
    packetType: "story_review_handoff",
    story: {
      title: input.story.title,
      status: input.story.status,
      contentCharacters: input.story.content?.trim().length ?? 0,
    },
    person: {
      displayName: input.person?.displayName || "Unlinked person",
      livingRisk,
    },
    recommendedAgent: chooseRecommendedAgent(input.publishReadiness),
    publishReadiness: {
      canPublish: input.publishReadiness.canPublish,
      status: input.publishReadiness.status,
      score: input.publishReadiness.score,
      summary: input.publishReadiness.summary,
      provenance: input.publishReadiness.provenance,
      recommendedNextActions: input.publishReadiness.recommendedNextActions,
    },
    blockers: input.publishReadiness.blockers,
    warnings: input.publishReadiness.warnings,
    writerInstructions: [
      "Keep claims grounded in linked evidence, events, places, and context reports.",
      "Do not introduce private living-person details or unsupported family relationships.",
      "Leave the story in draft or review unless publish gates are clear.",
    ],
    reviewerInstructions: [
      "Confirm the story has evidence, context, privacy, and provisional-relative clearance.",
      "Resolve blockers before requesting trusted publisher handoff.",
      "Use the public preview/status API before changing status to published.",
    ],
  };
}
