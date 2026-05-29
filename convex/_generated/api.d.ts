/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as citations from "../citations.js";
import type * as documents from "../documents.js";
import type * as events from "../events.js";
import type * as helpers from "../helpers.js";
import type * as importRuns from "../importRuns.js";
import type * as media from "../media.js";
import type * as personEvents from "../personEvents.js";
import type * as persons from "../persons.js";
import type * as places from "../places.js";
import type * as relationships from "../relationships.js";
import type * as researchLog from "../researchLog.js";
import type * as sources from "../sources.js";
import type * as vault from "../vault.js";
import type * as vaultCore from "../vaultCore.js";
import type * as vaultMigration from "../vaultMigration.js";
import type * as vaultMutations from "../vaultMutations.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  citations: typeof citations;
  documents: typeof documents;
  events: typeof events;
  helpers: typeof helpers;
  importRuns: typeof importRuns;
  media: typeof media;
  personEvents: typeof personEvents;
  persons: typeof persons;
  places: typeof places;
  relationships: typeof relationships;
  researchLog: typeof researchLog;
  sources: typeof sources;
  vault: typeof vault;
  vaultCore: typeof vaultCore;
  vaultMigration: typeof vaultMigration;
  vaultMutations: typeof vaultMutations;
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
