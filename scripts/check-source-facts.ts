import { readFileSync } from "node:fs";
import path from "node:path";
import { parseCapturePackage } from "@/lib/familysearch/capture";
import { extractSourceBackedFacts, findSourceFactConflicts } from "@/lib/familysearch/sourceFacts";

const fixtureRoot = path.join(process.cwd(), "tests", "fixtures", "capture");
const sourceCapture = parseCapturePackage(
  JSON.parse(readFileSync(path.join(fixtureRoot, "valid-source-v2.json"), "utf8"))
).capture;
const facts = extractSourceBackedFacts(sourceCapture);

assert(facts.some((fact) => fact.factType === "name" && fact.value === "John Jarvie"), "Name fact missing.");
assert(
  facts.some((fact) => fact.factType === "residence" || fact.factType === "census_residence"),
  "Residence/census fact missing."
);
assert(facts.every((fact) => fact.sourceKey && fact.sourceTitle), "Facts must keep source traceability.");

const conflictingCapture = {
  ...sourceCapture,
  person: {
    ...sourceCapture.person,
    birthDate: "1888",
  },
  sources: [
    {
      ...sourceCapture.sources[0],
      title: "Birth Register",
      indexed: {
        ...sourceCapture.sources[0].indexed,
        fields: [
          ...sourceCapture.sources[0].indexed.fields,
          { label: "Birth Date", value: "3 February 1890" },
        ],
      },
    },
  ],
};

const conflictFacts = extractSourceBackedFacts(conflictingCapture);
const conflicts = findSourceFactConflicts(conflictingCapture, conflictFacts);
assert(conflicts.some((conflict) => conflict.factType === "birth"), "Birth conflict should be detected.");

console.log("Source-backed fact extraction checks passed.");

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}
