/**
 * GEN-95C: Vitest config scoped ONLY to the Convex runtime tests
 * (convex/**\/*.test.ts), which run the REAL Convex query/mutation handlers
 * in-memory via convex-test.
 *
 * This is a SEPARATE runner from the node:test behavioral suite in scripts/*.ts
 * (run via `pnpm test`). Vitest is deliberately scoped to `convex/**\/*.test.ts`
 * so it does NOT pick up the node:test files; the two suites do not share a
 * runner.
 *
 * Setup follows the convex-test recommendation:
 *   - environment "edge-runtime" so the in-memory Convex engine has the globals
 *     it expects (the real query engine, not a fake ctx).
 *   - server.deps.inline ["convex-test"] so Vitest transforms the package
 *     instead of treating it as an external CJS dep.
 *   - resolve alias "@/" -> repo root, matching tsconfig `paths` so test imports
 *     like "@/convex/..." resolve the same way the app code does.
 */
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "edge-runtime",
    include: ["convex/**/*.test.ts"],
    server: {
      deps: {
        inline: ["convex-test"],
      },
    },
  },
});
