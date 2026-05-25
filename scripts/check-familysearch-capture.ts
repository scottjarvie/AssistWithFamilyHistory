import { readFileSync } from "node:fs";
import path from "node:path";
import { assessCapturePackageForImport, parseCapturePackage } from "@/lib/familysearch/capture";

const root = process.cwd();
const manifest = JSON.parse(readFileSync(path.join(root, "extension", "manifest.json"), "utf8")) as {
  manifest_version?: number;
  action?: { default_popup?: string };
  background?: { service_worker?: string };
  content_scripts?: Array<{ matches?: string[]; js?: string[] }>;
};
const serviceWorker = readFileSync(path.join(root, "extension", "service-worker.ts"), "utf8");
const runbook = readFileSync(
  path.join(root, "docs", "importing", "familysearch-source-capture-runbook.md"),
  "utf8",
);
const validSourceFixture = JSON.parse(
  readFileSync(path.join(root, "tests", "fixtures", "capture", "valid-source-v2.json"), "utf8"),
);

assert(manifest.manifest_version === 3, "Extension must remain Manifest V3.");
assert(manifest.action?.default_popup === "popup/index.html", "Extension popup path drifted.");
assert(manifest.background?.service_worker === "service-worker.js", "Extension service worker path drifted.");

const matches = manifest.content_scripts?.flatMap((script) => script.matches ?? []) ?? [];
assert(
  matches.some((match) => match.includes("familysearch.org") && match.includes("/sources/")),
  "Extension must match FamilySearch sources pages.",
);
assert(
  matches.some((match) => match.includes("familysearch.org") && match.includes("/memories/")),
  "Extension must match FamilySearch memories pages.",
);
assert(
  serviceWorker.includes("expandDelay: 1500") && serviceWorker.includes("maxExpansions: 50"),
  "Standard pacing changed; update the safe-use runbook before changing this.",
);
assert(
  serviceWorker.includes("mode,"),
  "Service worker must pass capture mode into diagnostics.",
);
assert(
  runbook.includes("Not Allowed") && runbook.toLowerCase().includes("broad unattended crawling"),
  "FamilySearch safe-use runbook must keep explicit prohibited behavior.",
);

const parsed = parseCapturePackage(validSourceFixture);
const readiness = assessCapturePackageForImport(parsed.capture);
assert(readiness.canImport, "Valid FamilySearch source fixture should pass import readiness.");

console.log("FamilySearch capture QA checks passed.");

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}
