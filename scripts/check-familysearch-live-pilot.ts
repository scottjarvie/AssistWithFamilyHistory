import { readFileSync } from "fs";
import path from "path";

const root = process.cwd();

const checks = [
  {
    file: "docs/importing/familysearch-live-capture-pilot.md",
    terms: [
      "User Login Checkpoint",
      "First Capture Queue",
      "FamilySearch ID",
      "Target page",
      "Privacy risk",
      "Merge intent",
      "One-Person Capture Loop",
      "standard mode",
      "/app/imports",
      "preview=true",
      "Stopping Rules",
      "living/private markers",
      "Handoff Note Format",
      "Media/privacy review needed",
      "pnpm check:familysearch-capture",
      "pnpm check:privacy-ai-safety",
      "Do not ask for or store the FamilySearch password",
    ],
  },
  {
    file: "docs/importing/familysearch-source-capture-runbook.md",
    terms: [
      "familysearch-live-capture-pilot.md",
      "one-person-at-a-time",
      "pilot checklist",
    ],
  },
  {
    file: "docs/README.md",
    terms: ["FamilySearch live capture pilot checklist"],
  },
  {
    file: "scripts/README.md",
    terms: ["pnpm check:familysearch-live-pilot"],
  },
];

const missing: string[] = [];

for (const check of checks) {
  const fullPath = path.join(root, check.file);
  const content = readFileSync(fullPath, "utf8");

  for (const term of check.terms) {
    if (!content.includes(term)) {
      missing.push(`${check.file}: missing ${term}`);
    }
  }
}

if (missing.length > 0) {
  console.error("FamilySearch live pilot checks failed:");
  for (const line of missing) {
    console.error(`- ${line}`);
  }
  process.exit(1);
}

console.log("FamilySearch live pilot checks passed.");
