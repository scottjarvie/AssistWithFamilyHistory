import { NextRequest, NextResponse } from "next/server";
import { getStoryCapabilities, resolveStoryActor } from "@/lib/stories/capabilities";

export async function GET(request: NextRequest) {
  const actor = resolveStoryActor(request);

  return NextResponse.json({
    success: true,
    schemaVersion: "2026-05-21",
    actor,
    capabilities: {
      story: {
        role: actor.role,
        actions: getStoryCapabilities(actor.role),
        notes:
          actor.role === "story_writer"
            ? "Story writers can draft, edit, request review, and preview publish gates. They cannot publish public stories."
            : actor.role === "trusted_publisher" || actor.role === "first_party_owner"
              ? "This role can publish public stories only after publish gates and human review confirmation pass."
              : "This role has limited story access.",
      },
    },
  });
}
