import {
  canPerformStoryAction,
  getStoryCapabilities,
  requireStoryAction,
  type StoryAction,
  type StoryActorRole,
} from "../lib/stories/capabilities";

const failures: string[] = [];

const expectations: Array<{
  role: StoryActorRole;
  allowed: StoryAction[];
  denied: StoryAction[];
}> = [
  {
    role: "story_writer",
    allowed: ["story:read", "story:draft", "story:edit", "story:request_review", "story:preview_publish"],
    denied: ["story:publish", "story:unpublish", "story:assign_reviewer"],
  },
  {
    role: "reviewer",
    allowed: ["story:read", "story:edit", "story:assign_reviewer", "story:preview_publish"],
    denied: ["story:publish", "story:unpublish"],
  },
  {
    role: "trusted_publisher",
    allowed: ["story:publish", "story:unpublish", "story:assign_reviewer", "story:preview_publish"],
    denied: [],
  },
];

for (const expectation of expectations) {
  const capabilities = getStoryCapabilities(expectation.role);
  for (const action of expectation.allowed) {
    if (!capabilities.includes(action)) {
      failures.push(`${expectation.role}: missing allowed action ${action}`);
    }
    if (!canPerformStoryAction(expectation.role, action)) {
      failures.push(`${expectation.role}: canPerformStoryAction rejected ${action}`);
    }
  }

  for (const action of expectation.denied) {
    if (canPerformStoryAction(expectation.role, action)) {
      failures.push(`${expectation.role}: ${action} should be denied`);
    }
    const denial = requireStoryAction(expectation.role, action);
    if (!denial) {
      failures.push(`${expectation.role}: requireStoryAction should return denial for ${action}`);
    }
  }
}

if (failures.length > 0) {
  console.error("Story capability assertions failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Story capability assertions passed");
