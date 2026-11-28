/**
 * Media byte delivery contract.
 *
 * Family history research runs on scanned records and photographs. An AI that
 * cannot see the census image cannot do this product's core work, so the vault
 * holding real bytes — and delivering them through the permission gates rather
 * than around them — is a product promise, not an implementation detail.
 *
 * Two regressions this guards, both of which would look harmless in a diff:
 *
 *   1. Making an upload immediately AI-readable. Putting a file in the vault
 *      and letting a model read it are separate acts, and the second one is the
 *      person's. A convenience change that sets `aiUseAllowed: true` on upload
 *      would silently widen every connection.
 *   2. Handing a model a storage link instead of bytes. A raw storage URL is on
 *      the never-exposed list; the whole point of protected delivery is that a
 *      model never fetches a private file itself.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  combineConcernSources,
  extractImplementationWithDelegatedHelpers,
  findUniqueExportedVariable,
  findUniqueForOfStatement,
  findUniqueFunctionDeclaration,
  readConcernFiles,
  stripComments,
} from "./lib/sourceGuards";

function read(relative: string) {
  return readFileSync(path.join(process.cwd(), relative), "utf8");
}

/** Assertions about behaviour should read code, not the prose explaining it. */
function code(relative: string) {
  return stripComments(read(relative), relative);
}

const schema = read("convex/schema.ts");
const mutationFiles = readConcernFiles([
  "convex/vaultMutations.ts",
  "convex/lib/vaultWrites/media.ts",
]);
const mutationEntryFile = readConcernFiles(["convex/vaultMutations.ts"]);
const evidenceFiles = readConcernFiles([
  "convex/mcpEvidence.ts",
  "convex/lib/mcpReads.ts",
]);
const evidenceEntryFile = readConcernFiles(["convex/mcpEvidence.ts"]);
const transportFiles = readConcernFiles(["convex/httpRoutes/evidenceDelivery.ts"]);
const evidence = combineConcernSources(evidenceFiles, { stripComments: true });
const transport = combineConcernSources(transportFiles, { stripComments: true });
const storage = code("convex/mediaEvidenceStorage.ts");
const uploadRoute = code("app/api/media/upload/route.ts");
const fileRoute = code("app/api/media/[mediaId]/file/route.ts");
const vaultReads = read("convex/vault.ts");

/* ---------------------------------------------- the vault can hold bytes */

assert.match(
  schema,
  /storageId:\s*v\.optional\(v\.id\("_storage"\)\)/,
  "media rows must be able to carry stored bytes, not only a reference",
);
const attachDecl = findUniqueExportedVariable(mutationEntryFile, "attachMediaFile", {
  stripComments: true,
});
assert.match(
  attachDecl.text,
  /export const attachMediaFile = mutation\(/,
  "attachMediaFile is how bytes become part of a media row",
);

/* ------------------------------- an upload is not a permission to read it */

const attachSection = extractImplementationWithDelegatedHelpers(attachDecl, mutationFiles, {
  stripComments: true,
});
assert.match(
  attachSection,
  /aiUseAllowed:\s*false/,
  "an uploaded file must arrive with AI use OFF; the person allows it separately",
);
assert.match(
  attachSection,
  /reviewStatus:\s*"unreviewed"/,
  "an uploaded file must arrive unreviewed, including when it replaces existing bytes",
);
assert.doesNotMatch(
  attachSection,
  /aiUseAllowed:\s*(true|args\.)/,
  "nothing on the upload path may set or accept AI-use permission",
);
assert.doesNotMatch(
  uploadRoute,
  /aiUseAllowed|reviewStatus:\s*"reviewed"/,
  "the upload route must not carry review or AI-use state at all",
);

/* ----------------------------- delivery goes through the same gates as ever */

const mediaGate = findUniqueFunctionDeclaration(evidenceFiles, "mediaSkipReason", {
  stripComments: true,
}).text;
for (const gate of [
  'reviewStatus !== "reviewed"',
  "aiUseAllowed !== true",
  'rightsStatus === "restricted"',
  "boundaryAllowsPerson(grant.boundary",
  "matchesVaultOwner(row.vaultOwnerId, grant.vaultOwnerId)",
]) {
  assert.ok(mediaGate.includes(gate), `evidence delivery must still enforce: ${gate}`);
}
const evidenceBatchDecl = findUniqueExportedVariable(evidenceEntryFile, "getEvidenceBatch", {
  stripComments: true,
});
const gates = extractImplementationWithDelegatedHelpers(evidenceBatchDecl, evidenceFiles, {
  stripComments: true,
});
assert.match(gates, /mediaSkipReason\(row, grant\)[\s\S]*stored\.push\(/);
assert.match(
  gates,
  /\(file\?\.size \?\? 0\) > limit/,
  "an over-budget stored file must be skipped before its bytes are read",
);

/* ------------------------------------ bytes travel, links never do */

assert.match(
  transport,
  /actionCtx\.storage\.get\(/,
  "the transport must read stored objects directly rather than fetching a URL",
);
const storedLoop = findUniqueForOfStatement(
  transportFiles,
  "batch.stored",
  "stored media delivery loop",
  { stripComments: true },
).text;
assert.doesNotMatch(
  storedLoop,
  /getUrl|item\.url/,
  "the stored-file delivery path must never mint or follow a URL",
);
assert.doesNotMatch(
  evidence,
  /storage\.getUrl/,
  "the evidence query must hand the transport a storage id, never a signed URL",
);
assert.match(storage, /authorizeWebsitePhoto, args\)[\s\S]*ctx\.storage\.get\(args\.originalId\)[\s\S]*authorizeWebsitePhoto, args\)[\s\S]*makeWebsiteEvidenceCopies\(/,
  "a live media decision must precede both reading and converting the source");

/* --------------------------- the person's own browser gets bytes, not a URL */

assert.match(
  vaultReads,
  /export const getOwnedMediaFile = internalQuery/,
  "owner-checked media file resolution must live behind an internal query",
);
assert.match(
  fileRoute,
  /new NextResponse\(upstream\.body/,
  "the owner file route must stream bytes rather than redirect to the signed URL",
);
assert.doesNotMatch(
  fileRoute,
  /redirect|NextResponse\.json\(\s*\{\s*url/,
  "the owner file route must never return or redirect to a storage URL",
);
assert.match(
  fileRoute,
  /private, no-store/,
  "private vault bytes must not be cached by a shared cache",
);
assert.ok(
  fileRoute.includes("status: 404") &&
    !/status:\s*403/.test(fileRoute),
  "a missing item and another owner's item must answer identically, never 403",
);

/* -------------------------------------------------- public truth stays true */

const aiTxt = read("app/ai.txt/route.ts");
assert.ok(
  aiTxt.includes("BYTES_NOT_AVAILABLE"),
  "/ai.txt must stay honest that reference-only media still cannot be delivered",
);
assert.match(
  aiTxt,
  /real bytes for media the person uploaded/,
  "/ai.txt must say that uploaded media is delivered as real bytes",
);

console.log("Media byte delivery contract passed: bytes stored privately, gated identically, delivered without a link.");
