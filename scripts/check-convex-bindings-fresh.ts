/**
 * Guard: the checked-in Convex bindings must match the modules on disk.
 *
 * WHY THIS EXISTS — the failure it is here to prevent
 * --------------------------------------------------
 * `convex/_generated/api.d.ts` is checked into the repo. It is also the file
 * that gives `internal.<module>.<fn>` its types. When a new Convex module is
 * added and the bindings are NOT regenerated, that module is simply missing
 * from the generated `api`, so every `internal.newModule.foo` silently resolves
 * to `any`.
 *
 * `any` hides real type errors. In particular it hides circular type inference:
 * an action whose return type is inferred from `ctx.runQuery(internal.self.x)`
 * needs the type of `internal`, which needs the type of its own module, which
 * needs that action. With stale bindings there is no cycle, because the whole
 * chain short-circuits to `any`.
 *
 * `convex deploy` regenerates the bindings BEFORE typechecking. So the real
 * types appear, the cycle appears with them, and the build fails with
 * TS7022/TS7023 — in the Vercel deploy, after review, after merge. Meanwhile
 * `pnpm typecheck` locally kept passing against the stale file. That is exactly
 * how production stopped building for five consecutive deployments.
 *
 * WHAT THIS CHECK DOES
 * --------------------
 * It regenerates the expected `api.d.ts` deterministically from the modules on
 * disk — no network, no deploy key, no Convex deployment — and requires the
 * checked-in file to match byte for byte.
 *
 * That single guarantee is what makes the rest of the pipeline honest: once the
 * checked-in bindings are provably identical to freshly generated ones, the
 * ordinary `pnpm typecheck` step IS a typecheck against fresh bindings, and any
 * inference cycle surfaces at PR time instead of at deploy time.
 *
 * If this check fails, run `npx convex codegen` against a DEV deployment and
 * commit the regenerated `convex/_generated/` files.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const CONVEX_DIR = join(process.cwd(), "convex");
const BINDINGS = join(CONVEX_DIR, "_generated", "api.d.ts");

/** Files Convex never registers as function modules. */
const NOT_A_FUNCTION_MODULE = new Set(["schema", "auth.config"]);
const MODULE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];

/** Every Convex function module, as the deployment addresses it. */
function collectModulePaths(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  )) {
    // `_generated` and any other underscore-prefixed directory is not user code.
    if (entry.name.startsWith("_")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectModulePaths(full, out);
      continue;
    }
    const ext = MODULE_EXTENSIONS.find((candidate) => entry.name.endsWith(candidate));
    if (!ext) continue;
    const modulePath = relative(CONVEX_DIR, full).slice(0, -ext.length).replaceAll("\\", "/");
    // Tests ship alongside the functions but are not part of the API surface.
    if (modulePath.endsWith(".test") || modulePath.endsWith(".spec")) continue;
    if (NOT_A_FUNCTION_MODULE.has(modulePath)) continue;
    out.push(modulePath);
  }
  return out;
}

/** `httpRoutes/mcp` -> `httpRoutes_mcp`, matching Convex's own identifier rule. */
function toIdentifier(modulePath: string): string {
  return modulePath.replace(/[^a-zA-Z0-9_$]/g, "_");
}

/** A key needs quoting in the generated object type unless it is a bare identifier. */
function toObjectKey(modulePath: string): string {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(modulePath) ? modulePath : `"${modulePath}"`;
}

function renderBindings(modulePaths: string[]): string {
  const imports = modulePaths
    .map((path) => `import type * as ${toIdentifier(path)} from "../${path}.js";`)
    .join("\n");
  const members = modulePaths
    .map((path) => `  ${toObjectKey(path)}: typeof ${toIdentifier(path)};`)
    .join("\n");

  return `/* eslint-disable */
/**
 * Generated \`api\` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run \`npx convex dev\`.
 * @module
 */

${imports}

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
${members}
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * \`\`\`js
 * const myFunctionReference = api.myModule.myFunction;
 * \`\`\`
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * \`\`\`js
 * const myFunctionReference = internal.myModule.myFunction;
 * \`\`\`
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
`;
}

function main(): void {
  const modulePaths = collectModulePaths(CONVEX_DIR).sort();
  const expected = renderBindings(modulePaths);
  const actual = readFileSync(BINDINGS, "utf8");

  if (expected === actual) {
    console.log(
      `check:convex-bindings-fresh — OK (${modulePaths.length} modules; checked-in bindings match the modules on disk)`,
    );
    return;
  }

  const expectedModules = new Set(modulePaths);
  const declared = new Set(
    [...actual.matchAll(/^import type \* as \S+ from "\.\.\/(.+)\.js";$/gm)].map((m) => m[1]),
  );
  const missing = [...expectedModules].filter((m) => !declared.has(m));
  const extra = [...declared].filter((m) => !expectedModules.has(m));

  console.error("check:convex-bindings-fresh — FAILED");
  console.error(
    "\nconvex/_generated/api.d.ts does not match the Convex modules on disk.\n" +
      "Stale bindings resolve `internal.<module>.<fn>` to `any`, which hides real type\n" +
      "errors locally and lets them fail inside `convex deploy` on Vercel instead.\n",
  );
  if (missing.length) {
    console.error(`  Modules on disk but MISSING from the bindings:\n    ${missing.join("\n    ")}`);
  }
  if (extra.length) {
    console.error(`  Modules in the bindings but no longer on disk:\n    ${extra.join("\n    ")}`);
  }
  if (!missing.length && !extra.length) {
    console.error("  The module list matches but the generated file content differs.");
  }
  console.error(
    "\nFix: run `npx convex codegen` against a DEV deployment (never --prod) and\n" +
      "commit the regenerated convex/_generated/ files.\n",
  );
  process.exit(1);
}

main();
