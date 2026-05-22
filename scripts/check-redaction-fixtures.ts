import { readFileSync } from "node:fs";
import path from "node:path";
import { EvidencePackSchema } from "@/features/source-docs/lib/schemas";
import { redactEvidencePack } from "@/features/source-docs/lib/redactor";

const pack = EvidencePackSchema.parse(
  JSON.parse(readFileSync(path.join(process.cwd(), "tests", "fixtures", "redaction", "privacy-risk-pack.json"), "utf8"))
);
const result = redactEvidencePack(pack);
const types = new Set(result.redactions.map((redaction) => redaction.type));
const redactedText = JSON.stringify(result.redactedPack);

assert(result.hasLivingIndicators, "Living/private indicators should be detected.");
assert(types.has("email"), "Email redaction missing.");
assert(types.has("phone"), "Phone redaction missing.");
assert(types.has("ssn"), "SSN redaction missing.");
assert(types.has("address"), "Address redaction missing.");
assert(redactedText.includes("[ADDRESS REDACTED]"), "Address placeholder missing.");
assert(!redactedText.includes("1234 Fictional Valley Road"), "Street address leaked.");
assert(redactedText.includes("12-31-1899"), "Historical date false positive should remain.");

console.log("Redaction fixture checks passed.");

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}
