import type { NextRequest } from "next/server";
import type { StoryStatus } from "./publishSafety";

export type StoryActorRole = "first_party_owner" | "story_writer" | "reviewer" | "trusted_publisher" | "unknown";

export type StoryAction =
  | "story:read"
  | "story:draft"
  | "story:edit"
  | "story:request_review"
  | "story:assign_reviewer"
  | "story:preview_publish"
  | "story:publish"
  | "story:unpublish";

export type StoryActor = {
  role: StoryActorRole;
  name?: string;
  source: "first_party" | "agent_header" | "body" | "unknown";
};

const roleActions: Record<StoryActorRole, StoryAction[]> = {
  first_party_owner: [
    "story:read",
    "story:draft",
    "story:edit",
    "story:request_review",
    "story:assign_reviewer",
    "story:preview_publish",
    "story:publish",
    "story:unpublish",
  ],
  trusted_publisher: [
    "story:read",
    "story:edit",
    "story:request_review",
    "story:assign_reviewer",
    "story:preview_publish",
    "story:publish",
    "story:unpublish",
  ],
  reviewer: [
    "story:read",
    "story:edit",
    "story:request_review",
    "story:assign_reviewer",
    "story:preview_publish",
  ],
  story_writer: ["story:read", "story:draft", "story:edit", "story:request_review", "story:preview_publish"],
  unknown: ["story:read"],
};

function normalizeRole(value: unknown): StoryActorRole | null {
  if (
    value === "first_party_owner" ||
    value === "story_writer" ||
    value === "reviewer" ||
    value === "trusted_publisher" ||
    value === "unknown"
  ) {
    return value;
  }
  return null;
}

function headerValue(request: NextRequest, name: string) {
  const value = request.headers.get(name);
  return value?.trim() || undefined;
}

export function resolveStoryActor(request: NextRequest, body?: Record<string, unknown>): StoryActor {
  const bodyRole = normalizeRole(body?.actorRole ?? body?.agentScope);
  if (bodyRole) {
    return {
      role: bodyRole,
      name: typeof body?.actorName === "string" ? body.actorName.trim() : undefined,
      source: "body",
    };
  }

  const headerRole = normalizeRole(headerValue(request, "x-dts-agent-scope"));
  if (headerRole) {
    return {
      role: headerRole,
      name: headerValue(request, "x-dts-agent-name"),
      source: "agent_header",
    };
  }

  return { role: "first_party_owner", source: "first_party" };
}

export function getStoryCapabilities(role: StoryActorRole) {
  return roleActions[role] ?? roleActions.unknown;
}

export function canPerformStoryAction(role: StoryActorRole, action: StoryAction) {
  return getStoryCapabilities(role).includes(action);
}

export function getActionForStatusChange(nextStatus: StoryStatus): StoryAction {
  if (nextStatus === "published") return "story:publish";
  if (nextStatus === "review") return "story:request_review";
  return "story:unpublish";
}

export function requireStoryAction(role: StoryActorRole, action: StoryAction) {
  if (canPerformStoryAction(role, action)) return null;

  return {
    error: "Story capability denied",
    details:
      action === "story:publish"
        ? "A story_writer or reviewer can preview publish readiness, but only a trusted publisher or first-party owner can publish a public story."
        : `The ${role} role cannot perform ${action}.`,
    requiredAction: action,
    role,
    allowedActions: getStoryCapabilities(role),
  };
}
