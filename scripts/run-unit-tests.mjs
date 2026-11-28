import { spawnSync } from "node:child_process";

const tests = [
  "test-vault-core.ts",
  "test-vault-migration.ts",
  "test-person-snapshot-parity.ts",
  "test-context-coverage-parity.ts",
  "test-context-gates.ts",
  "test-family-tree.ts",
  "test-task-lifecycle.ts",
  "test-queue-contract.ts",
  "test-agent-auth.ts",
  "test-vercel-build.ts",
  "test-public-story-error.ts",
  "test-story-publish-gate.ts",
  "test-ai-redaction.ts",
  "test-public-text-redaction.ts",
  "test-canonical-production-url.ts",
  "test-familysearch-source-facts.ts",
  "test-cloud-session-setup.mjs",
  "test-people-collection-dto.ts",
  "test-collection-row-projections.ts",
  "test-audit-records.ts",
  "test-local-auth.ts",
  "test-usage-limits-copy.ts",
  "test-family-row.ts",
  "test-home-drawn.ts",
  "test-source-guards.ts",
  "local-development.test.mjs",
];

const result = spawnSync(process.execPath, ["--import", "tsx", "--test", ...process.argv.slice(2), ...tests.map(file => `scripts/${file}`)], { stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
