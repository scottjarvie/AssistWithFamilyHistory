import { readFileSync } from "fs";
import path from "path";

const requiredDocs = [
  {
    file: "docs/importing/familysearch-capture-storage-map.md",
    terms: [
      "Canonical vault data",
      "Raw artifact",
      "Provisional graph data",
      "Review-blocked/private",
      "person.familySearchId",
      "sources[].sourceKey",
      "memories[].attachedBy",
      "diagnostics.failedExpansions",
    ],
  },
  {
    file: "docs/importing/familysearch-provider-api-readiness.md",
    terms: [
      "provider API access is pending",
      "browser-mediated",
      "familysearch_person_read",
      "capture_validate",
      "Credential misuse",
      "provider read permission",
    ],
  },
  {
    file: "docs/api/legacy-document-route-boundary.md",
    terms: [
      "/api/people/[id]/raw",
      "May generate",
      "internal legacy browser workflow",
      "read-only assistant",
    ],
  },
  {
    file: "docs/importing/loose-context-ingestion-model.md",
    terms: [
      "contextItems",
      "privacyLevel",
      "evidenceRole",
      "aiUseAllowed",
      "researcher conclusions",
    ],
  },
  {
    file: "docs/importing/source-neutral-intake-boundary.md",
    terms: [
      "provider-neutral intake envelope",
      "GEDCOM",
      "FamilySearch-Specific Assumptions",
      "Preview-before-merge",
    ],
  },
];

const missing: string[] = [];

for (const doc of requiredDocs) {
  const fullPath = path.join(process.cwd(), doc.file);
  const content = readFileSync(fullPath, "utf8");

  for (const term of doc.terms) {
    if (!content.includes(term)) {
      missing.push(`${doc.file}: missing ${term}`);
    }
  }
}

if (missing.length > 0) {
  console.error("FamilySearch readiness contract checks failed:");
  for (const line of missing) {
    console.error(`- ${line}`);
  }
  process.exit(1);
}

console.log("FamilySearch readiness contract checks passed.");
