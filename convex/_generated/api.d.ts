/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as access from "../access.js";
import type * as apiKeys from "../apiKeys.js";
import type * as citations from "../citations.js";
import type * as contextPackBuilder from "../contextPackBuilder.js";
import type * as documents from "../documents.js";
import type * as events from "../events.js";
import type * as helpers from "../helpers.js";
import type * as http from "../http.js";
import type * as httpRoutes_mcp from "../httpRoutes/mcp.js";
import type * as importRuns from "../importRuns.js";
import type * as mcpAcceptanceFixture from "../mcpAcceptanceFixture.js";
import type * as mcpClientTrust from "../mcpClientTrust.js";
import type * as mcpEvidence from "../mcpEvidence.js";
import type * as mcpFamilyHistory from "../mcpFamilyHistory.js";
import type * as mcpGrants from "../mcpGrants.js";
import type * as media from "../media.js";
import type * as mediaEvidenceControl from "../mediaEvidenceControl.js";
import type * as mediaEvidenceStorage from "../mediaEvidenceStorage.js";
import type * as personEvents from "../personEvents.js";
import type * as persons from "../persons.js";
import type * as places from "../places.js";
import type * as queue from "../queue.js";
import type * as rateLimits from "../rateLimits.js";
import type * as relationships from "../relationships.js";
import type * as researchLog from "../researchLog.js";
import type * as researchTasks from "../researchTasks.js";
import type * as sources from "../sources.js";
import type * as trustBoundary from "../trustBoundary.js";
import type * as vault from "../vault.js";
import type * as vaultCore from "../vaultCore.js";
import type * as vaultMigration from "../vaultMigration.js";
import type * as vaultMutations from "../vaultMutations.js";
import type * as vaultReads from "../vaultReads.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  access: typeof access;
  apiKeys: typeof apiKeys;
  citations: typeof citations;
  contextPackBuilder: typeof contextPackBuilder;
  documents: typeof documents;
  events: typeof events;
  helpers: typeof helpers;
  http: typeof http;
  "httpRoutes/mcp": typeof httpRoutes_mcp;
  importRuns: typeof importRuns;
  mcpAcceptanceFixture: typeof mcpAcceptanceFixture;
  mcpClientTrust: typeof mcpClientTrust;
  mcpEvidence: typeof mcpEvidence;
  mcpFamilyHistory: typeof mcpFamilyHistory;
  mcpGrants: typeof mcpGrants;
  media: typeof media;
  mediaEvidenceControl: typeof mediaEvidenceControl;
  mediaEvidenceStorage: typeof mediaEvidenceStorage;
  personEvents: typeof personEvents;
  persons: typeof persons;
  places: typeof places;
  queue: typeof queue;
  rateLimits: typeof rateLimits;
  relationships: typeof relationships;
  researchLog: typeof researchLog;
  researchTasks: typeof researchTasks;
  sources: typeof sources;
  trustBoundary: typeof trustBoundary;
  vault: typeof vault;
  vaultCore: typeof vaultCore;
  vaultMigration: typeof vaultMigration;
  vaultMutations: typeof vaultMutations;
  vaultReads: typeof vaultReads;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
