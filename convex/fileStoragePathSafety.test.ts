import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getAIStageFilePath,
  getPersonDir,
  getRunDir,
  getRunsDir,
  LocalArtifactPathError,
  resolveLocalArtifactPath,
  type LocalArtifactPathRole,
} from "@/lib/storage/fileStorage";

const DATA_ROOT = path.join(process.cwd(), "data", "source-docs", "people");
const OWNER = "guest_aaaaaaaa-1111-2222-3333-444444444444";
const PERSON = "KWCJ-RN4";
const RUN = "2026-07-18T09-30-00-000Z";
const STAGE = "grounding";
const FILENAME = "claims.json";

function expectStrictDescendant(root: string, target: string) {
  const relative = path.relative(root, target);
  expect(relative).not.toBe("");
  expect(path.isAbsolute(relative)).toBe(false);
  expect(relative).not.toBe("..");
  expect(relative.startsWith(`..${path.sep}`)).toBe(false);
}

function expectRefusal(run: () => unknown, role: LocalArtifactPathRole, rejected: unknown) {
  let thrown: unknown;
  try {
    run();
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(LocalArtifactPathError);
  const error = thrown as LocalArtifactPathError;
  expect(error.name).toBe("LocalArtifactPathError");
  expect(error.message).toBe(`Invalid local artifact ${role}.`);
  expect(error).not.toHaveProperty("cause");

  const serialized = `${error.name} ${error.message}`;
  expect(serialized).not.toContain(process.cwd());
  expect(serialized).not.toContain(DATA_ROOT);
  if (typeof rejected === "string" && rejected.includes("PRIVATE-SENTINEL")) {
    expect(serialized).not.toContain("PRIVATE-SENTINEL");
  }
}

describe("local artifact path containment", () => {
  it("preserves current valid owner, person, run, stage, filename, and fixed paths", () => {
    const personDir = getPersonDir(PERSON, OWNER);
    const runsDir = getRunsDir(PERSON, OWNER);
    const runDir = getRunDir(PERSON, RUN, OWNER);
    const aiFile = getAIStageFilePath(PERSON, RUN, STAGE, FILENAME, OWNER);

    expect(personDir).toBe(path.join(DATA_ROOT, OWNER, PERSON));
    expect(runsDir).toBe(path.join(DATA_ROOT, OWNER, PERSON, "runs"));
    expect(runDir).toBe(path.join(DATA_ROOT, OWNER, PERSON, "runs", RUN));
    expect(aiFile).toBe(
      path.join(DATA_ROOT, OWNER, PERSON, "runs", RUN, "ai-stages", STAGE, FILENAME)
    );

    expect(getPersonDir("persons:1", "local-dev")).toBe(
      path.join(DATA_ROOT, "local-dev", "persons:1")
    );
    expect(getPersonDir(PERSON)).toBe(path.join(DATA_ROOT, "local-dev", PERSON));

    for (const fixedName of [
      "runs",
      "person.json",
      "latest.json",
      "evidence-pack.json",
      "capture-package.json",
      "raw-document.md",
      "contextualized.md",
      "ai-stages",
    ]) {
      expect(resolveLocalArtifactPath(DATA_ROOT, [{ role: "path segment", value: fixedName }])).toBe(
        path.join(DATA_ROOT, fixedName)
      );
    }
  });

  it("keeps each accepted target under its declared root", () => {
    const ownerRoot = resolveLocalArtifactPath(DATA_ROOT, [
      { role: "owner identifier", value: OWNER },
    ]);
    const personRoot = getPersonDir(PERSON, OWNER);
    const runsRoot = getRunsDir(PERSON, OWNER);
    const runRoot = getRunDir(PERSON, RUN, OWNER);
    const stageRoot = resolveLocalArtifactPath(runRoot, [
      { role: "path segment", value: "ai-stages" },
      { role: "stage identifier", value: STAGE },
    ]);

    expectStrictDescendant(DATA_ROOT, ownerRoot);
    expectStrictDescendant(ownerRoot, personRoot);
    expectStrictDescendant(personRoot, runsRoot);
    expectStrictDescendant(runsRoot, runRoot);
    expectStrictDescendant(runRoot, stageRoot);
    expectStrictDescendant(stageRoot, getAIStageFilePath(PERSON, RUN, STAGE, FILENAME, OWNER));
  });

  it("refuses traversal and ambiguous forms for every request-controlled role", () => {
    const invalid = [
      "",
      ".",
      "..",
      "/absolute",
      "C:\\absolute",
      "C:relative",
      "C:",
      "\\\\server\\share",
      "nested/value",
      "nested\\value",
      "mixed/..\\value",
      "PRIVATE-SENTINEL/../escape",
      "%2f",
      "%2F",
      "%5c",
      "%5C",
      "%2e%2e",
      "%252f",
      "%00",
      "control\u0000value",
      "bidi\u202evalue",
      "lone\ud800surrogate",
      "trailing.",
      "trailing ",
      "e\u0301",
    ];

    const cases: Array<{
      role: LocalArtifactPathRole;
      build: (value: string) => unknown;
    }> = [
      { role: "owner identifier", build: (value) => getPersonDir(PERSON, value) },
      { role: "person identifier", build: (value) => getPersonDir(value, OWNER) },
      { role: "run identifier", build: (value) => getRunDir(PERSON, value, OWNER) },
      {
        role: "stage identifier",
        build: (value) => getAIStageFilePath(PERSON, RUN, value, FILENAME, OWNER),
      },
      {
        role: "filename",
        build: (value) => getAIStageFilePath(PERSON, RUN, STAGE, value, OWNER),
      },
    ];

    for (const { role, build } of cases) {
      for (const value of invalid) {
        expectRefusal(() => build(value), role, value);
      }
    }
  });

  it("keeps the existing owner character domain but fails instead of sanitizing", () => {
    for (const ownerId of ["user@example.com", "owner name", "persons:1"]) {
      expectRefusal(() => getPersonDir(PERSON, ownerId), "owner identifier", ownerId);
    }
  });

  it("refuses non-string runtime values without exposing them", () => {
    for (const value of [null, 42, { syntheticSecret: "PRIVATE-SENTINEL" }]) {
      expectRefusal(
        () =>
          resolveLocalArtifactPath(DATA_ROOT, [
            { role: "person identifier", value },
          ]),
        "person identifier",
        value
      );
    }
  });

  it("refuses an exact-root target and preserves NFC Unicode", () => {
    expectRefusal(
      () => resolveLocalArtifactPath(DATA_ROOT, []),
      "path segment",
      "PRIVATE-SENTINEL"
    );

    const nfc = "Jos\u00e9 \ud83d\udcda";
    expect(resolveLocalArtifactPath(DATA_ROOT, [{ role: "person identifier", value: nfc }])).toBe(
      path.join(DATA_ROOT, nfc)
    );
  });
});
