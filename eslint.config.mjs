import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "convex/_generated/**",
    "scripts/**",
    // Local-mode build output and ignored record-only Sandbox snapshots.
    ".next-local-*/**",
    "sandbox-backend*/**",
    ".scratch/**",
    ".convex/**",
    ".tmp/**",
    ".record-only-codegen-test-*/**",
    // Docs (archived evidence, prototypes) skip CI, so they must not lint.
    "docs/**",
  ]),
]);

export default eslintConfig;
