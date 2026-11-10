# AWL-0016 old-state reader audit

Searched tracked app, components, Convex, library, docs, README, text routes, YAML/OpenAPI and tool catalog for `needs_you`, four-state wording, Needs-you state/lane wording and move-to-Needs wording. Repeated after the final copy edits.

| Reader | Result |
| --- | --- |
| QueueCollection, QueueWorkspace, presentation, viewFilters | All live rows are projected through queueIdentity; the flag supplies the question and Answer/Archive controls. Three work states only. `state=needs_you` remains a backwards-compatible URL/filter selector for flags across states, never a write target. |
| Me page, yourData stats, QueueOverview | Exact counter totals; three state counts exclude proposals/archive. Flag count includes Answered. No first-500 Queue scan. |
| Nav/sidebar/mobile | Owner-keyed count-only request; same counter as tab; count errors hide the pill. No Queue/history fetch on layout. |
| mcpFamilyHistory.getBrief | Ordinary work excludes suggestions/archive/flags before its summary limit. Separate questionsForPerson includes exact question, state, person URL and Answer/Archive actions. Effective Queue read power, named Queue IDs and new suggestion person boundaries are respected. |
| Queue mutations and MCP schema | New state writes use the three-state model; request_user_action writes only a flag and releases this caller's lease. The API's old needs_you list selector is explicitly described as a flag filter. |
| /ai, ai.txt, llms.txt, server instructions, tool catalog | Shared AI-facing copy explains explicit addedBy, proposals versus suggestions, private review and flag authority. Human copy uses person-facing wording only. |
| FAQ and homepage CTA | Replaced all current four-state descriptions with three states plus flag. |
| Site Guide and Queue foundation handoff | Current model updated, including secondary surfaces. No move-to-Needs copy remains. |
| README and story-agent OpenAPI skeleton | Neither describes the old Queue input state; OpenAPI is the unrelated story-agent skeleton. MCP's catalog/schema is its current tool contract. |
| Capture, inbox, operations, research and record screens | No independent old Queue-state reader found. Research task attribution now says Added by your AI; record conclusions say AI proposal. Research task workflow and story review remain their own models. |

Intentional remaining `needs_you` occurrences: legacy stored validator/type, activity event identity, read-time projection, compatibility filter selectors and old fixture rows that prove projection. Tests cover that the stored row is not migrated and the response still carries the exact question.

Historical design-council reports, numbered baselines, tracker cards/work orders and prior release evidence retain their original terms. They are historical evidence, not active product instructions. The newly added BaselineMeQueue is an exact rendering of the previous Me card with invented counts, labelled as a reconstruction in the image manifest. No production screenshots or personal family data are included.

Person-session audit: Convex auth trusts only the configured Clerk issuer and audience `convex`. /mcp performs its own OAuth verification; it does not register an AI Convex provider. Public Queue reads/mutations and the touched stats action nevertheless reject OAuth identity claims and wrong issuers/audiences, in addition to owner checks, in both enforce and shadow modes. Tests simulate the same-owner AI identity explicitly. Native Clerk Convex website sessions may include sid without azp. The guard requires neither sid nor azp, refuses OAuth markers, and checks any present azp against the site’s known website origins. A native website fixture uses the exact ten claim names Scott supplied in lesson 17. Reference: [Clerk JWT templates](https://clerk.com/docs/guides/sessions/jwt-templates), [Convex custom JWT audience enforcement](https://docs.convex.dev/auth/advanced/custom-jwt).
