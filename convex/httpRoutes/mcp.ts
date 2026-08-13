/* eslint-disable @typescript-eslint/no-explicit-any -- Generated Convex references and SDK callbacks cross a runtime-validated MCP boundary. */
import type { HttpRouter } from "convex/server";
import { McpServer, createMcpHandler, type AuthInfo } from "@modelcontextprotocol/server";
import { createRemoteJWKSet, errors as joseErrors, jwtVerify } from "jose";
import { z } from "zod";
import { internal } from "../_generated/api";
import { httpAction, type ActionCtx } from "../_generated/server";
import {
  FAMILY_HISTORY_MCP_LIMITS,
  FAMILY_HISTORY_MCP_TOOL_NAMES,
  hashMcpInput,
} from "../../lib/mcp/contract";

const SERVER_NAME = "assist-with-family-history";
const SERVER_VERSION = "0.2.0";
const DEFAULT_RESOURCE = "https://assistwithfamilyhistory.com/mcp";
const LEGACY_RESOURCE_HOST = "discovertheirstories.com";
const LEGACY_ISSUER_HOST = "clerk.discovertheirstories.com";
const CANONICAL_RESOURCE_HOST = "assistwithfamilyhistory.com";
const CANONICAL_ISSUER_HOST = "clerk.assistwithfamilyhistory.com";
const mcp = (internal as any).mcpFamilyHistory;
const vault = (internal as any).vault;
const queue = (internal as any).queue;

type VerifiedPrincipal = {
  issuer: string;
  subject: string;
  clientId: string;
  scopes: string[];
};

function requiredUrl(name: "MCP_RESOURCE_URL" | "MCP_AUTH_SERVER_URL") {
  const raw = name === "MCP_RESOURCE_URL"
    ? process.env.MCP_RESOURCE_URL?.trim() || DEFAULT_RESOURCE
    : process.env.MCP_AUTH_SERVER_URL?.trim() || process.env.CLERK_JWT_ISSUER_DOMAIN?.trim();
  if (!raw) throw new Error(`Missing ${name}.`);
  const url = new URL(raw);
  // The protected deployment that changes Clerk's primary domain can still
  // receive the prior production env value. Normalize only those two exact
  // retired hosts; preview, development, and synthetic issuers stay untouched.
  if (name === "MCP_RESOURCE_URL" && url.hostname === LEGACY_RESOURCE_HOST) {
    url.hostname = CANONICAL_RESOURCE_HOST;
  }
  if (name === "MCP_AUTH_SERVER_URL" && url.hostname === LEGACY_ISSUER_HOST) {
    url.hostname = CANONICAL_ISSUER_HOST;
  }
  if (url.protocol !== "https:" && url.hostname !== "localhost") throw new Error(`${name} must be HTTPS.`);
  if (url.username || url.password || url.search || url.hash) throw new Error(`${name} must not contain credentials, query, or fragment.`);
  if (name === "MCP_RESOURCE_URL" && url.pathname !== "/mcp") throw new Error("MCP_RESOURCE_URL must identify the canonical /mcp resource.");
  if (name === "MCP_AUTH_SERVER_URL" && url.pathname !== "/") throw new Error("MCP_AUTH_SERVER_URL must be an authorization-server origin.");
  return url;
}

function resourceMetadataUrl(resource: URL) {
  return new URL(`/.well-known/oauth-protected-resource${resource.pathname}`, resource.origin).toString();
}

function challenge(resource: URL, code = "invalid_token", description = "A valid Family History OAuth token is required.") {
  return new Response(JSON.stringify({ error: code, error_description: description }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "WWW-Authenticate": `Bearer realm="assist-with-family-history", error="${code}", error_description="${description}", resource_metadata="${resourceMetadataUrl(resource)}"`,
    },
  });
}

function protectedResourceMetadata(resource: URL, issuer: URL) {
  return new Response(JSON.stringify({
    resource: resource.toString(),
    resource_name: "Assist With Family History",
    authorization_servers: [issuer.toString().replace(/\/$/, "")],
    bearer_methods_supported: ["header"],
    resource_documentation: new URL("/ai", resource.origin).toString(),
  }), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

let jwksCache: { issuer: string; value: ReturnType<typeof createRemoteJWKSet> } | null = null;
function jwksFor(issuer: URL) {
  const normalized = issuer.toString().replace(/\/$/, "");
  if (!jwksCache || jwksCache.issuer !== normalized) {
    jwksCache = {
      issuer: normalized,
      value: createRemoteJWKSet(new URL("/.well-known/jwks.json", `${normalized}/`)),
    };
  }
  return jwksCache.value;
}

async function verifyOAuth(request: Request, resource: URL, issuer: URL): Promise<AuthInfo | Response> {
  const match = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i);
  if (!match) return challenge(resource);
  try {
    const result = await jwtVerify(match[1], jwksFor(issuer), {
      issuer: issuer.toString().replace(/\/$/, ""),
    });
    if (result.protectedHeader.typ !== "at+jwt" && result.protectedHeader.typ !== "application/at+jwt") {
      throw new Error("Bearer is not an OAuth access token.");
    }
    if (!result.payload.sub || !result.payload.exp) throw new Error("OAuth token is missing subject or expiry.");
    const clientId = typeof result.payload.client_id === "string"
      ? result.payload.client_id
      : typeof result.payload.azp === "string"
        ? result.payload.azp
        : null;
    if (!clientId) throw new Error("OAuth token is missing its client identifier.");
    if (clientId.length > 160) throw new Error("OAuth client identifier is too long.");
    const rawScopes = result.payload.scope ?? result.payload.scp;
    const scopes = Array.isArray(rawScopes)
      ? rawScopes.filter((scope): scope is string => typeof scope === "string")
      : typeof rawScopes === "string"
        ? rawScopes.split(/\s+/).filter(Boolean)
        : [];
    return {
      token: match[1],
      clientId,
      scopes,
      expiresAt: result.payload.exp,
      resource,
      extra: {
        issuer: issuer.toString().replace(/\/$/, ""),
        subject: result.payload.sub,
      },
    };
  } catch (error) {
    const description = error instanceof joseErrors.JWTExpired
      ? "The Family History OAuth token expired."
      : "The Family History OAuth token is invalid for this resource.";
    return challenge(resource, "invalid_token", description);
  }
}

function toolResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    structuredContent: data as Record<string, unknown>,
  };
}

function toolError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);
  const marker = "MCP_FAMILY_HISTORY_ERROR:";
  let payload: Record<string, unknown> = {
    code: "INTERNAL_ERROR",
    message: "Assist With Family History could not complete the MCP operation.",
    recovery: "Retry once with the same operation ID, then report the failure without exposing private data.",
  };
  const index = raw.indexOf(marker);
  if (index >= 0) {
    try { payload = JSON.parse(raw.slice(index + marker.length)); } catch { /* stable fallback */ }
  }
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
    structuredContent: { error: payload },
  };
}

const id = z.string().min(1).max(100);
const operationId = z.string().min(8).max(FAMILY_HISTORY_MCP_LIMITS.operationId);
const createKey = z.string().min(3).max(FAMILY_HISTORY_MCP_LIMITS.recordKey);
const optionalNotes = z.string().trim().max(FAMILY_HISTORY_MCP_LIMITS.notes).nullable().optional();
const dateValue = z.object({
  original: z.string().min(1).max(160),
  formal: z.string().max(80).optional(),
  year: z.number().int().min(-10_000).max(10_000).optional(),
  month: z.number().int().min(1).max(12).optional(),
  day: z.number().int().min(1).max(31).optional(),
  approximate: z.boolean().optional(),
}).strict();
const placeRef = z.object({ original: z.string().min(1).max(500), placeId: id.optional() }).strict();
const personName = z.object({
  given: z.string().trim().max(160),
  surname: z.string().trim().max(160),
  suffix: z.string().trim().max(80).optional(),
  prefix: z.string().trim().max(80).optional(),
  nickname: z.string().trim().max(160).optional(),
}).strict();
const personFields = {
  name: personName.optional(),
  alternateNames: z.array(z.object({ type: z.string().max(80), given: z.string().max(160), surname: z.string().max(160), suffix: z.string().max(80).optional(), prefix: z.string().max(80).optional() }).strict()).max(30).optional(),
  sex: z.enum(["male", "female", "unknown"]).optional(),
  living: z.boolean().optional(),
  birth: z.object({ date: dateValue.optional(), place: placeRef.optional(), description: z.string().max(1_000).optional() }).strict().optional(),
  death: z.object({ date: dateValue.optional(), place: placeRef.optional(), description: z.string().max(1_000).optional() }).strict().optional(),
  researchStatus: z.enum(["not_started", "basic", "in_progress", "thorough", "complete"]).optional(),
  researchPriority: z.number().int().min(1).max(10).optional(),
  notes: optionalNotes,
  tags: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
};
const personSave = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("create"), createKey, fsId: z.string().max(80).optional(), ...personFields, name: personName, sex: z.enum(["male", "female", "unknown"]), living: z.boolean() }).strict(),
  z.object({ mode: z.literal("update"), personId: id, expectedUpdatedAt: z.number(), ...personFields }).strict(),
]);

const relationshipFact = z.object({
  type: z.string().min(1).max(120),
  date: dateValue.optional(),
  place: placeRef.optional(),
  description: z.string().max(1_000).optional(),
}).strict();
const relationshipFields = {
  type: z.enum(["Couple", "ParentChild", "Godparent", "Guardian", "Other"]).optional(),
  childRelationType: z.enum(["Biological", "Adopted", "Step", "Foster", "Guardianship", "Unknown"]).optional(),
  person1: id.optional(), person2: id.optional(),
  facts: z.array(relationshipFact).max(20).optional(),
};
const relationshipSave = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("create"), createKey, ...relationshipFields, type: z.enum(["Couple", "ParentChild", "Godparent", "Guardian", "Other"]), person1: id, person2: id, familySearchId: z.string().max(100).optional() }).strict(),
  z.object({ mode: z.literal("update"), relationshipId: id, expectedUpdatedAt: z.number(), ...relationshipFields }).strict(),
]);

const eventFields = {
  type: z.enum(["birth", "death", "burial", "baptism", "christening", "marriage", "divorce", "immigration", "emigration", "residence", "occupation", "military", "census", "naturalization", "probate", "land_record", "custom"]).optional(),
  customType: z.string().max(160).optional(),
  date: dateValue.extend({ range: z.boolean().optional() }).optional(),
  endDate: dateValue.omit({ approximate: true }).optional(),
  place: placeRef.optional(),
  description: optionalNotes,
  notes: optionalNotes,
  personRoles: z.array(z.object({ personId: id, role: z.enum(["primary", "witness", "officiant", "family", "other"]) }).strict()).max(30).optional(),
};
const eventSave = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("create"), createKey, ...eventFields, type: eventFields.type.unwrap() }).strict(),
  z.object({ mode: z.literal("update"), eventId: id, expectedUpdatedAt: z.number(), ...eventFields }).strict(),
]);

const sourceType = z.enum(["census", "vital_record", "church_record", "military", "immigration", "newspaper", "obituary", "photograph", "letter", "book", "website", "repository", "collection", "other"]);
const sourceFields = {
  title: z.string().trim().min(1).max(500).optional(), type: sourceType.optional(), repository: z.string().max(500).nullable().optional(),
  url: z.string().url().max(2_000).nullable().optional(), author: z.string().max(500).nullable().optional(), publicationDate: z.string().max(160).nullable().optional(),
  coverage: z.object({ temporal: z.object({ startYear: z.number().int().optional(), endYear: z.number().int().optional() }).strict().optional(), spatial: id.optional() }).strict().optional(),
  notes: optionalNotes,
};
const sourceSave = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("create"), createKey, fsId: z.string().max(100).optional(), ...sourceFields, title: z.string().trim().min(1).max(500), type: sourceType }).strict(),
  z.object({ mode: z.literal("update"), sourceId: id, expectedUpdatedAt: z.number(), ...sourceFields }).strict(),
]);
const citationFields = {
  isEvidence: z.boolean().optional(), page: z.string().max(300).nullable().optional(),
  confidence: z.enum(["very_high", "high", "medium", "low", "very_low"]).optional(),
  extractedText: optionalNotes, editedText: optionalNotes, url: z.string().url().max(2_000).nullable().optional(),
  accessDate: z.string().max(40).nullable().optional(), notes: optionalNotes,
};
const citationSave = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("create"), createKey, ...citationFields, confidence: z.enum(["very_high", "high", "medium", "low", "very_low"]) }).strict(),
  z.object({ mode: z.literal("update"), citationId: id, expectedUpdatedAt: z.number(), ...citationFields }).strict(),
]);
const evidenceSave = z.object({
  source: sourceSave,
  citation: citationSave,
  links: z.array(z.object({ targetType: z.enum(["person", "relationship", "event", "place"]), targetId: id, field: z.string().max(160).optional() }).strict()).max(30).optional(),
  facts: z.array(z.object({ factKey: createKey, personId: id, factType: z.enum(["name", "sex", "birth", "death", "marriage", "census_residence", "residence", "occupation", "other"]), label: z.string().min(1).max(300), value: z.string().min(1).max(2_000), date: z.string().max(160).optional(), place: z.string().max(500).optional(), confidence: z.enum(["high", "medium", "low"]), status: z.enum(["candidate", "accepted", "conflict", "rejected"]).optional(), conflictReason: z.string().max(1_000).optional() }).strict()).max(30).optional(),
}).strict();

const researchTaskFields = {
  personId: id.optional(), type: z.enum(["source_extraction", "record_search", "conflict_resolution", "story_writing", "context_research", "verification", "other"]).optional(),
  title: z.string().min(1).max(500).optional(), description: optionalNotes, status: z.enum(["todo", "in_progress", "blocked", "done"]).optional(),
  priority: z.enum(["high", "medium", "low"]).optional(), suggestedSources: z.array(z.string().max(500)).max(30).optional(), notes: optionalNotes,
};
const researchTaskSave = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("create"), createKey, ...researchTaskFields, type: researchTaskFields.type.unwrap(), title: researchTaskFields.title.unwrap() }).strict(),
  z.object({ mode: z.literal("update"), taskId: id, expectedUpdatedAt: z.number(), ...researchTaskFields }).strict(),
]);
const findingFields = {
  entityType: z.enum(["person", "place", "building", "relationship", "event", "source", "citation", "story", "historicalContext", "other"]).optional(), entityId: id.optional(),
  activityType: z.enum(["tier1_bulk_import", "tier2_sources", "tier2_memories", "tier2_notes", "tier2_relationships", "tier2_places", "tier3_deep_research", "tier3_narrative", "tier3_browser_extras", "context_research", "location_deep_research", "building_research", "photos_collected", "other"]).optional(),
  status: z.enum(["todo", "in_progress", "done", "blocked"]).optional(), summary: z.string().min(1).max(1_000).optional(), details: optionalNotes,
  outputRefs: z.array(z.string().max(500)).max(30).optional(), model: z.string().max(160).optional(),
};
const findingSave = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("create"), createKey, ...findingFields, entityType: findingFields.entityType.unwrap(), summary: findingFields.summary.unwrap() }).strict(),
  z.object({ mode: z.literal("update"), findingId: id, expectedUpdatedAt: z.number(), ...findingFields }).strict(),
]);
const researchSave = z.object({ task: researchTaskSave.optional(), finding: findingSave.optional() }).strict().refine((value) => value.task || value.finding, { message: "Provide a research task, finding, or both." });

const storyFields = {
  personId: id.optional(), relationshipId: id.optional(), type: z.enum(["biography", "day_in_life", "historical_context", "migration_story", "family_narrative", "anecdote", "timeline", "letter", "interview", "research_summary", "custom"]).optional(),
  title: z.string().min(1).max(500).optional(), content: z.string().min(1).max(FAMILY_HISTORY_MCP_LIMITS.story).optional(), citationIds: z.array(id).max(100).optional(),
  sourceFactIds: z.array(id).max(100).optional(), contextPackIds: z.array(id).max(30).optional(), status: z.enum(["draft", "review"]).optional(),
  promptUsed: z.string().max(4_000).optional(), modelUsed: z.string().max(160).optional(), tags: z.array(z.string().max(80)).max(30).optional(),
};
const storySave = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("create"), createKey, ...storyFields, type: storyFields.type.unwrap(), title: storyFields.title.unwrap(), content: storyFields.content.unwrap() }).strict(),
  z.object({ mode: z.literal("update"), storyId: id, expectedUpdatedAt: z.number(), ...storyFields }).strict(),
]);

function compactPersonWorkspace(workspace: any) {
  if (!workspace) return null;
  const cap = FAMILY_HISTORY_MCP_LIMITS.contextRows;
  const living = workspace.person?.living === true;
  return {
    person: living ? { ...workspace.person, notes: undefined } : workspace.person,
    relationships: (workspace.relationships ?? []).slice(0, cap).map((relationship: any) => ({ ...relationship, relatedPerson: relationship.relatedPerson?.living ? { ...relationship.relatedPerson, notes: undefined } : relationship.relatedPerson })),
    events: (workspace.events ?? []).slice(0, cap),
    sources: (workspace.sources ?? []).slice(0, cap),
    citations: (workspace.citations ?? []).slice(0, cap),
    sourceFacts: (workspace.sourceFacts ?? []).slice(0, cap),
    researchTasks: (workspace.researchTasks ?? []).slice(0, cap),
    researchLog: (workspace.researchLog ?? []).slice(0, cap),
    stories: (workspace.stories ?? []).slice(0, cap),
    contextItems: (workspace.contextItems ?? []).filter((item: any) => item.aiUseAllowed && item.reviewStatus === "reviewed").slice(0, cap),
    media: (workspace.media ?? []).filter((item: any) => item.aiUseAllowed && item.reviewStatus === "reviewed").slice(0, cap),
    places: (workspace.places ?? []).slice(0, cap),
    researchChecks: (workspace.researchChecks ?? []).slice(0, cap),
    operations: workspace.operations,
    stats: workspace.stats,
    privacyNote: living ? "Living-person notes are withheld from this context response. Reviewed AI-allowed context and media remain eligible." : "Private owner-scoped context. Only reviewed AI-allowed loose context and media are included.",
    truncated: ["relationships", "events", "sources", "citations", "sourceFacts", "researchTasks", "researchLog", "stories", "places"].some((key) => (workspace[key]?.length ?? 0) > cap),
  };
}

function withOperation<T extends z.ZodType>(schema: T) {
  return z.intersection(z.object({ operationId }).strict(), schema);
}

export function createFamilyHistoryServer(actionCtx: ActionCtx, principal: VerifiedPrincipal) {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: `Call get_family_history_brief first. Search, then hydrate a stable ID before editing. Prefer save_complete_result for a normal finished research pass. Use granular save tools for corrections. Never publish, delete, merge identities, or invent owner/workspace IDs. Available tools: ${FAMILY_HISTORY_MCP_TOOL_NAMES.join(", ")}.` },
  );
  const write = async (toolName: string, fn: any, input: Record<string, unknown>) => {
    try {
      const { operationId: op, ...semanticInput } = input;
      return toolResult(await actionCtx.runMutation(fn, {
        principal,
        operationId: op,
        requestHash: await hashMcpInput({ toolName, ...semanticInput }),
        input: semanticInput,
      }));
    } catch (error) { return toolError(error); }
  };

  server.registerTool("get_family_history_brief", {
    title: "Get Family History brief",
    description: "FIRST CALL. Return a bounded map of recent people, stories, open research, findings, and Queue work in this signed-in owner's private family-history vault.",
    inputSchema: z.object({}).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  }, async () => { try { return toolResult(await actionCtx.runQuery(mcp.getBrief, { principal })); } catch (error) { return toolError(error); } });

  server.registerTool("search_family_history", {
    title: "Search Family History",
    description: "Search bounded owner-scoped summaries across people, sources, stories, research tasks/findings, and events. Hydrate a returned stable ID before editing.",
    inputSchema: z.object({ query: z.string().trim().min(1).max(200), kinds: z.array(z.enum(["person", "source", "story", "research_task", "research_finding", "event"])).max(6).optional(), limit: z.number().int().min(1).max(FAMILY_HISTORY_MCP_LIMITS.searchLimit).default(25) }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  }, async (input) => { try { return toolResult(await actionCtx.runQuery(mcp.search, { principal, ...input })); } catch (error) { return toolError(error); } });

  server.registerTool("get_family_history_context", {
    title: "Get Family History context",
    description: "Hydrate one person, story, source, event, relationship, research task, or research finding. Person context keeps living-person notes withheld and includes only reviewed AI-allowed loose context/media.",
    inputSchema: z.object({ kind: z.enum(["person", "story", "source", "event", "relationship", "research_task", "research_finding"]), id }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  }, async ({ kind, id: recordId }) => {
    try {
      if (kind === "person") return toolResult(compactPersonWorkspace(await actionCtx.runQuery(vault.getPersonWorkspace, { vaultOwnerId: principal.subject, personIdentifier: recordId })));
      if (kind === "story") return toolResult(await actionCtx.runQuery(vault.getStoryReview, { vaultOwnerId: principal.subject, storyId: recordId as any }));
      return toolResult(await actionCtx.runQuery(mcp.getRecordContext, { principal, kind, id: recordId }));
    } catch (error) { return toolError(error); }
  });

  server.registerTool("save_person", {
    title: "Save person",
    description: "Replay-safely create a person or optimistically correct an existing person. Broad discovery never exposes living-person notes, and this write remains private to the signed-in vault.",
    inputSchema: withOperation(personSave),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  }, (input: any) => write("save_person", mcp.savePerson, input));

  server.registerTool("save_relationship", {
    title: "Save relationship",
    description: "Replay-safely create or optimistically correct one direct person-to-person relationship with optional dated facts. Both people must already belong to this vault.",
    inputSchema: withOperation(relationshipSave),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  }, (input: any) => write("save_relationship", mcp.saveRelationship, input));

  server.registerTool("save_event", {
    title: "Save event",
    description: "Replay-safely create or optimistically correct one event and add or update its person roles. Omitted roles are not removed.",
    inputSchema: withOperation(eventSave),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  }, (input: any) => write("save_event", mcp.saveEvent, input));

  server.registerTool("save_source_evidence", {
    title: "Save source evidence",
    description: "Save a source plus one citation, target links, and candidate/accepted/conflicting source facts in one replay-safe call. Evidence never silently overwrites a person's canonical conclusions.",
    inputSchema: withOperation(evidenceSave),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  }, (input: any) => write("save_source_evidence", mcp.saveSourceEvidence, input));

  server.registerTool("save_research_work", {
    title: "Save research work",
    description: "Create or correct a research task, a durable research finding, or both. Record blocked and uncertain outcomes honestly instead of omitting them.",
    inputSchema: withOperation(researchSave),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  }, (input: any) => write("save_research_work", mcp.saveResearchWork, input));

  server.registerTool("save_story_work", {
    title: "Save story work",
    description: "Create or optimistically correct a private draft or move it to human review. MCP cannot publish or edit a published story.",
    inputSchema: withOperation(storySave),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  }, (input: any) => write("save_story_work", mcp.saveStoryWork, input));

  server.registerTool("save_complete_result", {
    title: "Save complete Family History result",
    description: "PREFERRED HAPPY PATH. Atomically save one finished research pass: optional person correction, relationships, events, source evidence, task/finding state, and private story work. Use stable create keys. Maximum 10 rows per repeated kind.",
    inputSchema: z.object({
      operationId,
      summary: z.string().trim().min(1).max(1_000),
      personId: id.optional(),
      person: personSave.optional(),
      relationships: z.array(relationshipSave).max(FAMILY_HISTORY_MCP_LIMITS.completeResultRowsPerKind).optional(),
      events: z.array(eventSave).max(FAMILY_HISTORY_MCP_LIMITS.completeResultRowsPerKind).optional(),
      evidence: z.array(evidenceSave).max(FAMILY_HISTORY_MCP_LIMITS.completeResultRowsPerKind).optional(),
      research: researchSave.optional(),
      stories: z.array(storySave).max(FAMILY_HISTORY_MCP_LIMITS.completeResultRowsPerKind).optional(),
    }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  }, (input: any) => write("save_complete_result", mcp.saveCompleteResult, input));

  const queuePrincipal = {
    ownerId: principal.subject,
    actorId: "oauth-chosen-ai",
    actorKind: "chosen_ai" as const,
    scopes: ["queue:read", "queue:claim", "queue:update", "queue:complete"],
    credentialId: `${principal.issuer}#${principal.clientId}`,
  };
  server.registerTool("get_queue", {
    title: "Get Family History Queue",
    description: "List a bounded page of private Queue directives or hydrate one item and its attributable activity. Queue context does not grant domain-write authority.",
    inputSchema: z.discriminatedUnion("action", [
      z.object({ action: z.literal("list"), state: z.enum(["needs_you", "working", "waiting_for_your_ai", "done"]).optional(), priority: z.enum(["high", "normal", "low"]).optional(), cursor: z.string().max(500).nullable().optional(), limit: z.number().int().min(1).max(50).default(25) }).strict(),
      z.object({ action: z.literal("detail"), queueItemId: id, cursor: z.string().max(500).nullable().optional(), limit: z.number().int().min(1).max(100).default(50) }).strict(),
    ]),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  }, async (input) => {
    try {
      if (input.action === "list") return toolResult(await actionCtx.runAction(queue.agentListQueueItems, { principal: queuePrincipal, state: input.state, priority: input.priority, paginationOpts: { numItems: input.limit, cursor: input.cursor ?? null } }));
      return toolResult(await actionCtx.runAction(queue.agentGetQueueItem, { principal: queuePrincipal, queueItemId: input.queueItemId as any, activityPagination: { numItems: input.limit, cursor: input.cursor ?? null } }));
    } catch (error) { return toolError(error); }
  });

  server.registerTool("update_queue", {
    title: "Update Family History Queue",
    description: "Claim, checkpoint, pause for the user, complete, or report failure for work assigned to the OAuth chosen-AI identity. Requires exact current version and replay-safe operation ID.",
    inputSchema: z.discriminatedUnion("action", [
      z.object({ action: z.literal("claim"), operationId, queueItemId: id, expectedVersion: z.number().int().min(1), leaseMs: z.number().int().min(60_000).max(1_800_000), nextStep: z.string().min(1).max(1_000) }).strict(),
      z.object({ action: z.literal("checkpoint"), operationId, queueItemId: id, expectedVersion: z.number().int().min(1), leaseMs: z.number().int().min(60_000).max(1_800_000), nextStep: z.string().min(1).max(1_000) }).strict(),
      z.object({ action: z.literal("request_user_action"), operationId, queueItemId: id, expectedVersion: z.number().int().min(1), requiredAction: z.string().min(1).max(1_000) }).strict(),
      z.object({ action: z.literal("complete"), operationId, queueItemId: id, expectedVersion: z.number().int().min(1), resultSummary: z.string().min(1).max(4_000), resultRefs: z.array(z.string().max(500)).max(20).optional() }).strict(),
      z.object({ action: z.literal("fail"), operationId, queueItemId: id, expectedVersion: z.number().int().min(1), failureCode: z.string().min(1).max(120), failureSummary: z.string().min(1).max(1_000), retryable: z.boolean(), nextRetryAt: z.number().int().positive().optional() }).strict(),
    ]),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  }, async (input) => {
    try {
      const common = { principal: queuePrincipal, queueItemId: input.queueItemId as any, expectedVersion: input.expectedVersion, idempotencyKey: input.operationId };
      if (input.action === "claim") return toolResult(await actionCtx.runMutation(queue.agentClaimQueueItem, { ...common, leaseMs: input.leaseMs, nextStep: input.nextStep }));
      if (input.action === "checkpoint") return toolResult(await actionCtx.runMutation(queue.agentCheckpointQueueItem, { ...common, leaseMs: input.leaseMs, nextStep: input.nextStep }));
      if (input.action === "request_user_action") return toolResult(await actionCtx.runMutation(queue.agentRequestUserAction, { ...common, requiredAction: input.requiredAction }));
      if (input.action === "complete") return toolResult(await actionCtx.runMutation(queue.agentCompleteQueueItem, { ...common, resultSummary: input.resultSummary, resultRefs: input.resultRefs }));
      return toolResult(await actionCtx.runMutation(queue.agentFailQueueItem, { ...common, failureCode: input.failureCode, failureSummary: input.failureSummary, retryable: input.retryable, nextRetryAt: input.nextRetryAt }));
    } catch (error) { return toolError(error); }
  });

  return server;
}

async function handleMcp(actionCtx: ActionCtx, request: Request) {
  const resource = requiredUrl("MCP_RESOURCE_URL");
  const issuer = requiredUrl("MCP_AUTH_SERVER_URL");
  const url = new URL(request.url);
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization,content-type,mcp-protocol-version,mcp-method,mcp-name",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    } });
  }
  if (url.pathname === "/.well-known/oauth-protected-resource/mcp") {
    return request.method === "GET" ? protectedResourceMetadata(resource, issuer) : new Response("Method not allowed", { status: 405, headers: { Allow: "GET,OPTIONS" } });
  }
  if (url.pathname !== "/mcp") return new Response("Not found", { status: 404 });
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { Allow: "POST,OPTIONS" } });
  const auth = await verifyOAuth(request, resource, issuer);
  if (auth instanceof Response) return auth;
  const subject = auth.extra?.subject;
  const principalIssuer = auth.extra?.issuer;
  if (typeof subject !== "string" || typeof principalIssuer !== "string") return challenge(resource);
  if ((await request.clone().arrayBuffer()).byteLength > FAMILY_HISTORY_MCP_LIMITS.requestBytes) {
    return new Response(JSON.stringify({ error: "request_too_large", error_description: "Family History MCP requests are limited to 256 KiB." }), { status: 413, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  }
  const handler = createMcpHandler(
    () => createFamilyHistoryServer(actionCtx, { issuer: principalIssuer, subject, clientId: auth.clientId, scopes: auth.scopes }),
    { legacy: "stateless", responseMode: "json", onerror: () => console.error("[MCP] Family History protocol error") },
  );
  return await handler.fetch(request, { authInfo: auth });
}

export function registerMcpRoutes(http: HttpRouter) {
  http.route({ path: "/mcp", method: "POST", handler: httpAction(handleMcp) });
  http.route({ path: "/mcp", method: "OPTIONS", handler: httpAction(handleMcp) });
  http.route({ path: "/.well-known/oauth-protected-resource/mcp", method: "GET", handler: httpAction(handleMcp) });
  http.route({ path: "/.well-known/oauth-protected-resource/mcp", method: "OPTIONS", handler: httpAction(handleMcp) });
}
