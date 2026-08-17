/* eslint-disable @typescript-eslint/no-explicit-any -- Generated Convex references and SDK callbacks cross a runtime-validated MCP boundary. */
import type { HttpRouter } from "convex/server";
import { McpServer, createMcpHandler, type AuthInfo } from "@modelcontextprotocol/server";
import { createRemoteJWKSet, errors as joseErrors, jwtVerify } from "jose";
import { z } from "zod";
import { internal } from "../_generated/api";
import { httpAction, type ActionCtx } from "../_generated/server";
import {
  FAMILY_HISTORY_MCP_LIMITS,
  hashMcpInput,
} from "../../lib/mcp/contract";
import { findTool } from "../../lib/mcp/catalog";
import {
  CONNECTION_SETTINGS_URL,
  decideToolAccess,
  permittedTools,
  queueScopesForGrant,
  type AccessRefusal,
  type GrantResolution,
} from "../../lib/mcp/authorize";
import { EVIDENCE_SKIP_GUIDANCE } from "../mcpEvidence";

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
const evidence = (internal as any).mcpEvidence;
const grants = (internal as any).mcpGrants;

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
    // Resource-specific audience. When the provider states an audience or a
    // resource indicator we hold it to this exact resource, so a token minted
    // for a different Assist product cannot be replayed here. When the provider
    // omits the claim entirely — which the current production instance does —
    // we accept the token rather than break the one client whose lifecycle is
    // already proved, and the product grant remains the real authorization.
    // Tightening this to "required" is a provider-side change, written up in
    // docs/operations/bring-your-ai-provider-actions.md.
    const audienceClaim = result.payload.aud ?? (result.payload as Record<string, unknown>).resource;
    const audiences = Array.isArray(audienceClaim)
      ? audienceClaim.filter((value): value is string => typeof value === "string")
      : typeof audienceClaim === "string"
        ? [audienceClaim]
        : [];
    if (audiences.length > 0) {
      const canonical = resource.toString();
      const origin = resource.origin;
      if (!audiences.some((value) => value === canonical || value === origin || value === `${origin}/`)) {
        throw new Error("OAuth token was not issued for this Family History resource.");
      }
    }
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

/* ------------------------------------------------------------ batch schemas */

const batchPersonSave = personSave;

const batchRelationshipSave = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("create"),
    createKey,
    ...relationshipFields,
    type: z.enum(["Couple", "ParentChild", "Godparent", "Guardian", "Other"]),
    person1: id.optional(),
    person2: id.optional(),
    person1CreateKey: createKey.optional(),
    person2CreateKey: createKey.optional(),
    familySearchId: z.string().max(100).optional(),
  }).strict(),
  z.object({ mode: z.literal("update"), relationshipId: id, expectedUpdatedAt: z.number(), ...relationshipFields }).strict(),
]);

const batchEventRole = z.object({
  personId: id.optional(),
  personCreateKey: createKey.optional(),
  role: z.enum(["primary", "witness", "officiant", "family", "other"]),
}).strict();

const batchEventSave = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("create"), createKey, ...eventFields, type: eventFields.type.unwrap(), personRoles: z.array(batchEventRole).max(30).optional() }).strict(),
  z.object({ mode: z.literal("update"), eventId: id, expectedUpdatedAt: z.number(), ...eventFields, personRoles: z.array(batchEventRole).max(30).optional() }).strict(),
]);

const batchEvidenceSave = z.object({
  source: sourceSave,
  citation: citationSave,
  links: z.array(z.object({
    targetType: z.enum(["person", "relationship", "event", "place"]),
    targetId: id.optional(),
    targetCreateKey: createKey.optional(),
    field: z.string().max(160).optional(),
  }).strict()).max(30).optional(),
  facts: z.array(z.object({
    factKey: createKey,
    personId: id.optional(),
    personCreateKey: createKey.optional(),
    factType: z.enum(["name", "sex", "birth", "death", "marriage", "census_residence", "residence", "occupation", "other"]),
    label: z.string().min(1).max(300),
    value: z.string().min(1).max(2_000),
    date: z.string().max(160).optional(),
    place: z.string().max(500).optional(),
    confidence: z.enum(["high", "medium", "low"]),
    status: z.enum(["candidate", "accepted", "conflict", "rejected"]).optional(),
    conflictReason: z.string().max(1_000).optional(),
  }).strict()).max(30).optional(),
}).strict();

const batchStorySave = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("create"), createKey, ...storyFields, personCreateKey: createKey.optional(), type: storyFields.type.unwrap(), title: storyFields.title.unwrap(), content: storyFields.content.unwrap() }).strict(),
  z.object({ mode: z.literal("update"), storyId: id, expectedUpdatedAt: z.number(), ...storyFields, personCreateKey: createKey.optional() }).strict(),
]);

/* --------------------------------------------------------- content encoding */

function base64FromBytes(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

/**
 * Deliver evidence as MCP content blocks. The `uri` is an opaque product
 * reference, never the storage URL the bytes came from — handing a model a
 * private link is on the NEVER_EXPOSED list, and the whole reason this tool
 * exists is protected delivery instead of scraping.
 */
function evidenceBlock(item: { id: string; kind: string; mimeType: string; title: string }, bytes: Uint8Array) {
  const data = base64FromBytes(bytes);
  if (item.mimeType.startsWith("image/")) {
    return { type: "image" as const, data, mimeType: item.mimeType };
  }
  return {
    type: "resource" as const,
    resource: {
      uri: `familyhistory://${item.kind}/${item.id}`,
      mimeType: item.mimeType,
      blob: data,
    },
  };
}

/* ------------------------------------------------------------------- server */

export function createFamilyHistoryServer(
  actionCtx: ActionCtx,
  principal: VerifiedPrincipal,
  resolution: GrantResolution,
) {
  const permitted = permittedTools(resolution, Date.now());
  const permittedNames = new Set(permitted.map((tool) => tool.name));
  const grant = resolution.state === "active" ? resolution.grant : null;
  const grantId = grant?.grantId;

  const instructions = grant
    ? `Call family_history_get_brief first. Search, then hydrate a stable ID before editing. For a source that touches several people at once — a census page, a family group sheet — use family_history_save_records: one call, per-item results. Use family_history_save_complete_result when the pass must be all-or-nothing. Never publish, delete, merge identities, or invent owner/workspace IDs. This connection is approved for: ${grant.scopes.join(", ")}. Tools available to it: ${permitted.map((tool) => tool.name).join(", ")}.`
    : `This AI connection has not been approved for Assist With Family History yet. Signing in proved who the person is; it did not decide what this connection may do. Ask the person to open ${CONNECTION_SETTINGS_URL}, choose which parts of their research this connection may use, and approve it. No Family History tools are available until they do.`;

  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION }, { instructions });

  /** Register the canonical name and its compatibility alias on ONE handler. */
  const registerTool = (
    canonicalName: string,
    config: { inputSchema: z.ZodType; annotations: Record<string, boolean> },
    handler: (input: any) => Promise<any>,
  ) => {
    const tool = findTool(canonicalName);
    if (!tool || !permittedNames.has(tool.name)) return;
    server.registerTool(tool.name, {
      title: tool.title,
      description: tool.description,
      inputSchema: config.inputSchema as any,
      annotations: config.annotations,
    }, handler as any);
    if (tool.alias) {
      // Same handler, same scope. Kept so a client that connected before
      // Family History namespacing keeps working while it refreshes.
      server.registerTool(tool.alias, {
        title: tool.title,
        description: `DEPRECATED NAME for ${tool.name}. Identical behaviour and identical permission; prefer the ${tool.name} name. ${tool.description}`,
        inputSchema: config.inputSchema as any,
        annotations: config.annotations,
      }, handler as any);
    }
  };

  const touch = async (toolName: string) => {
    if (!grantId) return;
    // Real calls only; listing tools is not use.
    try {
      await actionCtx.runMutation(grants.touchGrantUse, {
        grantId: grantId as any,
        vaultOwnerId: principal.subject,
        toolName,
      });
    } catch {
      /* never let bookkeeping fail a call the person approved */
    }
  };

  const read = async (toolName: string, run: () => Promise<unknown>) => {
    try {
      const result = toolResult(await run());
      await touch(toolName);
      return result;
    } catch (error) {
      return toolError(error);
    }
  };

  const write = async (toolName: string, fn: any, input: Record<string, unknown>) => {
    try {
      const { operationId: op, ...semanticInput } = input;
      const result = toolResult(await actionCtx.runMutation(fn, {
        principal,
        grantId,
        operationId: op,
        requestHash: await hashMcpInput({ toolName, ...semanticInput }),
        input: semanticInput,
      }));
      await touch(toolName);
      return result;
    } catch (error) {
      return toolError(error);
    }
  };

  const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true };
  const writeSafe = { readOnlyHint: false, destructiveHint: false, idempotentHint: true };

  registerTool("family_history_get_brief", {
    inputSchema: z.object({}).strict(),
    annotations: readOnly,
  }, () => read("family_history_get_brief", () => actionCtx.runQuery(mcp.getBrief, { principal })));

  registerTool("family_history_search", {
    inputSchema: z.object({
      query: z.string().trim().min(1).max(200),
      kinds: z.array(z.enum(["person", "source", "story", "research_task", "research_finding", "event"])).max(6).optional(),
      limit: z.number().int().min(1).max(FAMILY_HISTORY_MCP_LIMITS.searchLimit).default(25),
    }).strict(),
    annotations: readOnly,
  }, (input: any) => read("family_history_search", () => actionCtx.runQuery(mcp.search, { principal, ...input })));

  registerTool("family_history_get_context", {
    inputSchema: z.object({
      kind: z.enum(["person", "story", "source", "event", "relationship", "research_task", "research_finding"]),
      id,
    }).strict(),
    annotations: readOnly,
  }, async (input: any) => {
    // The boundary is decided before any lookup, so an out-of-boundary refusal
    // cannot double as an existence check.
    const decision = decideToolAccess({
      toolName: "family_history_get_context",
      resolution,
      now: Date.now(),
      input,
    });
    if (!decision.allowed) return refusalResult(decision);
    return read("family_history_get_context", async () => {
      if (input.kind === "person") {
        return compactPersonWorkspace(await actionCtx.runQuery(vault.getPersonWorkspace, {
          vaultOwnerId: principal.subject,
          personIdentifier: input.id,
        }));
      }
      if (input.kind === "story") {
        return await actionCtx.runQuery(vault.getStoryReview, {
          vaultOwnerId: principal.subject,
          storyId: input.id as any,
        });
      }
      return await actionCtx.runQuery(mcp.getRecordContext, { principal, kind: input.kind, id: input.id });
    });
  });

  registerTool("family_history_get_evidence", {
    inputSchema: z.object({
      items: z.array(z.object({
        kind: z.enum(["media", "document"]),
        id,
      }).strict()).min(1).max(FAMILY_HISTORY_MCP_LIMITS.evidenceItems),
    }).strict(),
    annotations: readOnly,
  }, async (input: any) => {
    try {
      const batch: any = await actionCtx.runQuery(evidence.getEvidenceBatch, {
        principal,
        grantId,
        items: input.items,
      });
      const content: any[] = [];
      const delivered: any[] = [];
      const skipped: any[] = [...batch.skipped];
      let spent = 0;

      for (const item of batch.delivered) {
        if (spent + item.sizeBytes > FAMILY_HISTORY_MCP_LIMITS.evidenceTotalBytes) {
          skipped.push({
            id: item.id,
            kind: item.kind,
            reason: "TOO_LARGE",
            whatToDo: "This call's delivery budget ran out before this item. Ask for it in a second, smaller call.",
          });
          continue;
        }
        spent += item.sizeBytes;
        content.push({ type: "text" as const, text: `# ${item.title}\n\n${item.text}` });
        delivered.push({ id: item.id, kind: item.kind, title: item.title, mimeType: item.mimeType, sizeBytes: item.sizeBytes });
      }

      // Files the vault holds come first: they are the evidence a person
      // deliberately put here, they are read straight out of private storage
      // with no URL involved, and they are the only media path that reliably
      // works. A scanned census page reaches the model as real image bytes.
      for (const item of batch.stored) {
        if (spent >= FAMILY_HISTORY_MCP_LIMITS.evidenceTotalBytes) {
          skipped.push({
            id: item.id,
            kind: item.kind,
            reason: "TOO_LARGE",
            whatToDo: "This call's delivery budget ran out before this item. Ask for it in a second, smaller call.",
          });
          continue;
        }
        try {
          const blob = await actionCtx.storage.get(item.storageId as any);
          if (!blob) throw new Error("missing");
          const bytes = new Uint8Array(await blob.arrayBuffer());
          if (bytes.byteLength > FAMILY_HISTORY_MCP_LIMITS.evidencePerItemBytes) {
            skipped.push({ id: item.id, kind: item.kind, reason: "TOO_LARGE", whatToDo: EVIDENCE_SKIP_GUIDANCE.TOO_LARGE });
            continue;
          }
          if (spent + bytes.byteLength > FAMILY_HISTORY_MCP_LIMITS.evidenceTotalBytes) {
            skipped.push({
              id: item.id,
              kind: item.kind,
              reason: "TOO_LARGE",
              whatToDo: "This call's delivery budget ran out before this item. Ask for it in a second, smaller call.",
            });
            continue;
          }
          spent += bytes.byteLength;
          content.push(evidenceBlock(item, bytes));
          delivered.push({ id: item.id, kind: item.kind, title: item.title, mimeType: item.mimeType, sizeBytes: bytes.byteLength });
        } catch {
          skipped.push({ id: item.id, kind: item.kind, reason: "BYTES_NOT_AVAILABLE", whatToDo: EVIDENCE_SKIP_GUIDANCE.BYTES_NOT_AVAILABLE });
        }
      }

      for (const item of batch.fetchable) {
        if (spent >= FAMILY_HISTORY_MCP_LIMITS.evidenceTotalBytes) {
          skipped.push({
            id: item.id,
            kind: item.kind,
            reason: "TOO_LARGE",
            whatToDo: "This call's delivery budget ran out before this item. Ask for it in a second, smaller call.",
          });
          continue;
        }
        try {
          const response = await fetch(item.url, { redirect: "follow" });
          if (!response.ok) throw new Error("unavailable");
          const bytes = new Uint8Array(await response.arrayBuffer());
          if (bytes.byteLength > FAMILY_HISTORY_MCP_LIMITS.evidencePerItemBytes) {
            skipped.push({ id: item.id, kind: item.kind, reason: "TOO_LARGE", whatToDo: EVIDENCE_SKIP_GUIDANCE.TOO_LARGE });
            continue;
          }
          if (spent + bytes.byteLength > FAMILY_HISTORY_MCP_LIMITS.evidenceTotalBytes) {
            skipped.push({
              id: item.id,
              kind: item.kind,
              reason: "TOO_LARGE",
              whatToDo: "This call's delivery budget ran out before this item. Ask for it in a second, smaller call.",
            });
            continue;
          }
          spent += bytes.byteLength;
          content.push(evidenceBlock(item, bytes));
          delivered.push({ id: item.id, kind: item.kind, title: item.title, mimeType: item.mimeType, sizeBytes: bytes.byteLength });
        } catch {
          skipped.push({ id: item.id, kind: item.kind, reason: "BYTES_NOT_AVAILABLE", whatToDo: EVIDENCE_SKIP_GUIDANCE.BYTES_NOT_AVAILABLE });
        }
      }

      const summary = {
        delivered,
        skipped,
        note: skipped.length === 0
          ? "Every item you asked for was delivered."
          : "Some items were not delivered. Each one says why and what to do. Name the gap in your result rather than guessing at the missing evidence, and never ask the person for a file link.",
      };
      await touch("family_history_get_evidence");
      return {
        content: [...content, { type: "text" as const, text: JSON.stringify(summary) }],
        structuredContent: summary as Record<string, unknown>,
      };
    } catch (error) {
      return toolError(error);
    }
  });

  registerTool("family_history_save_person", {
    inputSchema: withOperation(personSave),
    annotations: writeSafe,
  }, (input: any) => write("family_history_save_person", mcp.savePerson, input));

  registerTool("family_history_save_relationship", {
    inputSchema: withOperation(relationshipSave),
    annotations: writeSafe,
  }, (input: any) => write("family_history_save_relationship", mcp.saveRelationship, input));

  registerTool("family_history_save_event", {
    inputSchema: withOperation(eventSave),
    annotations: writeSafe,
  }, (input: any) => write("family_history_save_event", mcp.saveEvent, input));

  registerTool("family_history_save_source_evidence", {
    inputSchema: withOperation(evidenceSave),
    annotations: writeSafe,
  }, (input: any) => write("family_history_save_source_evidence", mcp.saveSourceEvidence, input));

  registerTool("family_history_save_research_work", {
    inputSchema: withOperation(researchSave),
    annotations: writeSafe,
  }, (input: any) => write("family_history_save_research_work", mcp.saveResearchWork, input));

  registerTool("family_history_save_story_work", {
    inputSchema: withOperation(storySave),
    annotations: writeSafe,
  }, (input: any) => write("family_history_save_story_work", mcp.saveStoryWork, input));

  registerTool("family_history_save_records", {
    inputSchema: z.object({
      operationId,
      summary: z.string().trim().min(1).max(1_000),
      people: z.array(batchPersonSave).max(FAMILY_HISTORY_MCP_LIMITS.batchPeople).optional(),
      relationships: z.array(batchRelationshipSave).max(FAMILY_HISTORY_MCP_LIMITS.batchRelationships).optional(),
      events: z.array(batchEventSave).max(FAMILY_HISTORY_MCP_LIMITS.batchEvents).optional(),
      evidence: z.array(batchEvidenceSave).max(FAMILY_HISTORY_MCP_LIMITS.batchEvidence).optional(),
      stories: z.array(batchStorySave).max(FAMILY_HISTORY_MCP_LIMITS.batchStories).optional(),
    }).strict(),
    annotations: writeSafe,
  }, (input: any) => write("family_history_save_records", mcp.saveRecords, input));

  registerTool("family_history_save_complete_result", {
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
    annotations: writeSafe,
  }, (input: any) => write("family_history_save_complete_result", mcp.saveCompleteResult, input));

  // Queue scopes now derive from the grant. A queue:read-only connection gets a
  // read-only Queue principal; the claim/update/complete set arrives only with
  // family_history:queue:work.
  const queuePrincipal = {
    ownerId: principal.subject,
    actorId: "oauth-chosen-ai",
    actorKind: "chosen_ai" as const,
    scopes: queueScopesForGrant(grant?.scopes ?? []),
    credentialId: `${principal.issuer}#${principal.clientId}`,
  };

  registerTool("family_history_get_queue", {
    inputSchema: z.discriminatedUnion("action", [
      z.object({ action: z.literal("list"), state: z.enum(["needs_you", "working", "waiting_for_your_ai", "done"]).optional(), priority: z.enum(["high", "normal", "low"]).optional(), cursor: z.string().max(500).nullable().optional(), limit: z.number().int().min(1).max(50).default(25) }).strict(),
      z.object({ action: z.literal("detail"), queueItemId: id, cursor: z.string().max(500).nullable().optional(), limit: z.number().int().min(1).max(100).default(50) }).strict(),
    ]),
    annotations: readOnly,
  }, async (input: any) => {
    const decision = decideToolAccess({ toolName: "family_history_get_queue", resolution, now: Date.now(), input });
    if (!decision.allowed) return refusalResult(decision);
    return read("family_history_get_queue", async () => {
      if (input.action === "list") {
        return await actionCtx.runAction(queue.agentListQueueItems, {
          principal: queuePrincipal,
          state: input.state,
          priority: input.priority,
          paginationOpts: { numItems: input.limit, cursor: input.cursor ?? null },
        });
      }
      return await actionCtx.runAction(queue.agentGetQueueItem, {
        principal: queuePrincipal,
        queueItemId: input.queueItemId as any,
        activityPagination: { numItems: input.limit, cursor: input.cursor ?? null },
      });
    });
  });

  registerTool("family_history_update_queue", {
    inputSchema: z.discriminatedUnion("action", [
      z.object({ action: z.literal("claim"), operationId, queueItemId: id, expectedVersion: z.number().int().min(1), leaseMs: z.number().int().min(60_000).max(1_800_000), nextStep: z.string().min(1).max(1_000) }).strict(),
      z.object({ action: z.literal("checkpoint"), operationId, queueItemId: id, expectedVersion: z.number().int().min(1), leaseMs: z.number().int().min(60_000).max(1_800_000), nextStep: z.string().min(1).max(1_000) }).strict(),
      z.object({ action: z.literal("request_user_action"), operationId, queueItemId: id, expectedVersion: z.number().int().min(1), requiredAction: z.string().min(1).max(1_000) }).strict(),
      z.object({ action: z.literal("complete"), operationId, queueItemId: id, expectedVersion: z.number().int().min(1), resultSummary: z.string().min(1).max(4_000), resultRefs: z.array(z.string().max(500)).max(20).optional() }).strict(),
      z.object({ action: z.literal("fail"), operationId, queueItemId: id, expectedVersion: z.number().int().min(1), failureCode: z.string().min(1).max(120), failureSummary: z.string().min(1).max(1_000), retryable: z.boolean(), nextRetryAt: z.number().int().positive().optional() }).strict(),
    ]),
    annotations: writeSafe,
  }, async (input: any) => {
    const decision = decideToolAccess({ toolName: "family_history_update_queue", resolution, now: Date.now(), input });
    if (!decision.allowed) return refusalResult(decision);
    return read("family_history_update_queue", async () => {
      const common = { principal: queuePrincipal, queueItemId: input.queueItemId as any, expectedVersion: input.expectedVersion, idempotencyKey: input.operationId };
      if (input.action === "claim") return await actionCtx.runMutation(queue.agentClaimQueueItem, { ...common, leaseMs: input.leaseMs, nextStep: input.nextStep });
      if (input.action === "checkpoint") return await actionCtx.runMutation(queue.agentCheckpointQueueItem, { ...common, leaseMs: input.leaseMs, nextStep: input.nextStep });
      if (input.action === "request_user_action") return await actionCtx.runMutation(queue.agentRequestUserAction, { ...common, requiredAction: input.requiredAction });
      if (input.action === "complete") return await actionCtx.runMutation(queue.agentCompleteQueueItem, { ...common, resultSummary: input.resultSummary, resultRefs: input.resultRefs });
      return await actionCtx.runMutation(queue.agentFailQueueItem, { ...common, failureCode: input.failureCode, failureSummary: input.failureSummary, retryable: input.retryable, nextRetryAt: input.nextRetryAt });
    });
  });

  return server;
}

/* ------------------------------------------------------------ HTTP handling */

function refusalResult(refusal: AccessRefusal) {
  const payload = { code: refusal.code, message: refusal.message, recovery: refusal.recovery };
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
    structuredContent: { error: payload },
  };
}

/**
 * Refuse a `tools/call` the resolved grant does not permit, before the MCP
 * server ever sees it. Discovery hides the tool; this makes the call itself
 * answer with an actionable machine error instead of "unknown tool", so an AI
 * knows to ask the person rather than retry.
 */
function grantRefusalResponse(body: unknown, resolution: GrantResolution): Response | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const message = body as { id?: unknown; method?: unknown; params?: { name?: unknown } };
  if (message.id === undefined || message.id === null) return null;

  // Discovery with nothing permitted is an empty catalog, not a protocol error.
  // The MCP server would otherwise refuse tools/list outright because it has no
  // tools registered, which reads as a broken server rather than an unapproved
  // connection. The `instructions` returned at initialize say what to do.
  if (message.method === "tools/list" && permittedTools(resolution, Date.now()).length === 0) {
    return Response.json(
      // `resultType` is required by protocol revision 2026-07-28 and the MCP
      // server is not in this path to stamp it. Without it a conforming client
      // rejects the empty catalog as a malformed response, which is the one
      // thing this branch exists to avoid.
      {
        jsonrpc: "2.0",
        id: message.id,
        result: {
          resultType: "complete",
          // Never cached: the person may approve this connection a second from
          // now, and a cached empty catalog would keep telling their AI it has
          // no tools long after they said yes. Private because the answer is
          // one person's grant, not a property of the server.
          ttlMs: 0,
          cacheScope: "private",
          tools: [],
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  if (message.method !== "tools/call") return null;
  const name = typeof message.params?.name === "string" ? message.params.name : "";
  const decision = decideToolAccess({ toolName: name, resolution, now: Date.now(), input: undefined });
  if (decision.allowed) return null;
  return Response.json(
    {
      jsonrpc: "2.0",
      id: message.id,
      // This refusal is written straight onto the wire, bypassing the MCP server
      // that would normally stamp the revision's required discriminator. Without
      // it a conforming 2026-07-28 client rejects the whole response as
      // malformed and the person's AI sees a broken server instead of the
      // actionable "ask them to approve this" message we wrote for it.
      result: { resultType: "complete", ...refusalResult(decision) },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
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
  const rawBody = await request.clone().arrayBuffer();
  if (rawBody.byteLength > FAMILY_HISTORY_MCP_LIMITS.requestBytes) {
    return new Response(JSON.stringify({ error: "request_too_large", error_description: "Family History MCP requests are limited to 256 KiB." }), { status: 413, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  }

  // Parsed before the grant is resolved because the client's self-declared name
  // travels in the body, not in a header.
  let parsedBody: unknown = null;
  try {
    parsedBody = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    parsedBody = null;
  }

  // Resolve the product grant on EVERY request. The transport is stateless, so
  // this is what makes revocation immediate: an already-issued Clerk access
  // token stops mattering the moment the grant leaves `active`. We never wait
  // for a JWT to expire, and we never trust the token's lifetime as a grant.
  const resolution: GrantResolution = await actionCtx.runMutation(grants.resolveForRequest, {
    issuer: principalIssuer,
    subject,
    clientId: auth.clientId,
    observedClientName: observedClientName(parsedBody, request),
  });

  const refusal = grantRefusalResponse(parsedBody, resolution);
  if (refusal) {
    const method = (parsedBody as { method?: unknown })?.method;
    const name = (parsedBody as { params?: { name?: unknown } })?.params?.name;
    if (method !== "tools/call") return refusal;
    try {
      await actionCtx.runMutation(grants.recordGrantActivity, {
        vaultOwnerId: subject,
        requestId: `denied:${Date.now()}`,
        grantId: resolution.state === "active" ? (resolution.grant.grantId as any) : undefined,
        clientId: auth.clientId,
        toolName: typeof name === "string" ? name : "unknown_tool",
        outcome: "denied",
        statusCode: 200,
        detail: `Refused: ${resolution.state === "active" ? "outside the approved permission" : `connection ${resolution.state}`}.`,
      });
    } catch {
      /* activity is never allowed to change the answer */
    }
    return refusal;
  }

  const principal: VerifiedPrincipal = {
    issuer: principalIssuer,
    subject,
    clientId: auth.clientId,
    scopes: auth.scopes,
  };
  const handler = createMcpHandler(
    () => createFamilyHistoryServer(actionCtx, principal, resolution),
    { legacy: "stateless", responseMode: "json", onerror: () => console.error("[MCP] Family History protocol error") },
  );
  return await handler.fetch(request, { authInfo: auth });
}

/**
 * What the client called itself. It is stored as a LABEL for the person to
 * recognise, never as authority: the only identity that decides anything is the
 * verified client_id.
 *
 * It is read from the request body's `clientInfo`, which protocol revision
 * 2026-07-28 repeats on every message precisely so a stateless server can see it
 * without a session. The `Mcp-Name` header is NOT the client's name — that
 * header carries the tool being called — so reading it here labelled a person's
 * connection with something like "save_person". The user-agent is the last
 * resort, and an empty name is better than a wrong one.
 */
function observedClientName(body: unknown, request: Request): string | undefined {
  const params = (body as { params?: Record<string, unknown> } | null)?.params;
  const meta = params?._meta as Record<string, unknown> | undefined;
  const fromMeta = (meta?.["io.modelcontextprotocol/clientInfo"] as { name?: unknown } | undefined)?.name;
  const fromInitialize = (params?.clientInfo as { name?: unknown } | undefined)?.name;
  const raw =
    (typeof fromMeta === "string" ? fromMeta : undefined) ??
    (typeof fromInitialize === "string" ? fromInitialize : undefined) ??
    request.headers.get("user-agent") ??
    undefined;
  const trimmed = raw?.trim();
  return trimmed ? trimmed.slice(0, 120) : undefined;
}

export function registerMcpRoutes(http: HttpRouter) {
  http.route({ path: "/mcp", method: "POST", handler: httpAction(handleMcp) });
  http.route({ path: "/mcp", method: "OPTIONS", handler: httpAction(handleMcp) });
  http.route({ path: "/.well-known/oauth-protected-resource/mcp", method: "GET", handler: httpAction(handleMcp) });
  http.route({ path: "/.well-known/oauth-protected-resource/mcp", method: "OPTIONS", handler: httpAction(handleMcp) });
}
