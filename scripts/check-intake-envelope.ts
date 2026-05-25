import { readFileSync } from "node:fs";
import path from "node:path";
import { IntakeEnvelopeSchema, familySearchCaptureToIntakeEnvelope } from "@/lib/intake/envelope";
import { parseCapturePackage } from "@/lib/familysearch/capture";

const fixtureRoot = path.join(process.cwd(), "tests", "fixtures");
const envelopeFiles = [
  "intake/familysearch-envelope.json",
  "intake/gedcom-envelope.json",
];

for (const file of envelopeFiles) {
  const envelope = IntakeEnvelopeSchema.parse(JSON.parse(readFileSync(path.join(fixtureRoot, file), "utf8")));
  assert(envelope.provider, `${file}: provider is required.`);
  assert(envelope.subject.name.length > 0, `${file}: subject name is required.`);
  assert(envelope.sources.length > 0, `${file}: at least one source is required.`);
  assert(envelope.sources.every((source) => source.sourceKey && source.title), `${file}: source key/title required.`);
  assert(envelope.diagnostics.rawArtifactRefs.length > 0, `${file}: raw artifact refs are required.`);
}

const capture = parseCapturePackage(
  JSON.parse(readFileSync(path.join(fixtureRoot, "capture/valid-source-v2.json"), "utf8"))
).capture;
const converted = IntakeEnvelopeSchema.parse(familySearchCaptureToIntakeEnvelope(capture));

assert(converted.provider === "familysearch", "FamilySearch adapter must preserve provider.");
assert(converted.subject.externalId === capture.person.familySearchId, "FamilySearch adapter must preserve subject ID.");
assert(converted.sources.length === capture.sources.length, "FamilySearch adapter source count drifted.");
assert(converted.diagnostics.rawArtifactRefs.includes(capture.pageUrl), "FamilySearch adapter must preserve raw page ref.");

console.log("Provider-neutral intake envelope checks passed.");

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}
