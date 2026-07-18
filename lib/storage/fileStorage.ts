/**
 * File Storage Utilities
 * 
 * Purpose: Manage local file storage for raw capture artifacts and derived documents
 * 
 * Key Elements:
 * - Read/write JSON files
 * - Manage versioned runs
 * - List people and runs
 * - Path utilities
 * 
 * Dependencies:
 * - fs/promises
 * - path
 * - ./types
 * 
 * Last Updated: Initial setup
 */

import fs from "fs/promises";
import path from "path";
import { PersonMetadata, RunMetadata, LatestPointer } from "./types";
import { DEFAULT_LOCAL_VAULT_OWNER } from "@/lib/vault/constants";

// Base data directory
const DATA_DIR = path.join(process.cwd(), "data", "source-docs", "people");

export type LocalArtifactPathRole =
  | "owner identifier"
  | "person identifier"
  | "run identifier"
  | "stage identifier"
  | "filename"
  | "path segment";

export type LocalArtifactPathSegment = {
  role: LocalArtifactPathRole;
  value: unknown;
};

const LOCAL_ARTIFACT_ROLE_LABELS: Record<LocalArtifactPathRole, string> = {
  "owner identifier": "owner identifier",
  "person identifier": "person identifier",
  "run identifier": "run identifier",
  "stage identifier": "stage identifier",
  filename: "filename",
  "path segment": "path segment",
};

const WINDOWS_DRIVE_PREFIX = /^[a-z]:/i;
const PERCENT_ENCODED_OCTET = /%[0-9a-f]{2}/i;
const CONTROL_OR_BIDI_CHARACTER = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u;
const UNPAIRED_SURROGATE = /[\ud800-\udfff]/u;
const OWNER_IDENTIFIER = /^[a-zA-Z0-9_-]+$/;

export class LocalArtifactPathError extends Error {
  constructor(role: LocalArtifactPathRole) {
    super(`Invalid local artifact ${LOCAL_ARTIFACT_ROLE_LABELS[role] ?? "path segment"}.`);
    this.name = "LocalArtifactPathError";
  }
}

function assertSafeLocalArtifactSegment(segment: LocalArtifactPathSegment): string {
  const { role, value } = segment;
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value === "." ||
    value === ".." ||
    value !== value.normalize("NFC") ||
    value.endsWith(".") ||
    value.endsWith(" ") ||
    value.includes("/") ||
    value.includes("\\") ||
    path.posix.isAbsolute(value) ||
    path.win32.isAbsolute(value) ||
    WINDOWS_DRIVE_PREFIX.test(value) ||
    PERCENT_ENCODED_OCTET.test(value) ||
    CONTROL_OR_BIDI_CHARACTER.test(value) ||
    UNPAIRED_SURROGATE.test(value)
  ) {
    throw new LocalArtifactPathError(role);
  }
  return value;
}

/**
 * Resolve a strict lexical descendant of a trusted local-artifact root.
 *
 * This proves lexical containment only. It does not inspect the filesystem and
 * therefore assumes the managed dev-only artifact root is not an
 * attacker-controlled symlink tree. Interior colons remain accepted for
 * current identifiers such as `persons:1`; local mirrors are not portable to
 * Windows NTFS alternate-data-stream semantics.
 */
export function resolveLocalArtifactPath(
  trustedRoot: string,
  segments: readonly LocalArtifactPathSegment[]
): string {
  const root = path.resolve(trustedRoot);
  if (segments.length === 0) {
    throw new LocalArtifactPathError("path segment");
  }

  const safeSegments = segments.map(assertSafeLocalArtifactSegment);
  const target = path.resolve(root, ...safeSegments);
  const relative = path.relative(root, target);
  if (
    relative.length === 0 ||
    path.isAbsolute(relative) ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`)
  ) {
    throw new LocalArtifactPathError(segments.at(-1)?.role ?? "path segment");
  }

  return target;
}

/**
 * Whether local-filesystem persistence is enabled.
 *
 * Convex is the canonical store (GEN-91). The local `data/` tree is a
 * dev-only convenience mirror. In production (Vercel) the filesystem is
 * ephemeral and must never be a source of truth, so FS writes are skipped
 * there. Set DTS_LOCAL_FS=1 to force-enable, or DTS_LOCAL_FS=0 to force-disable.
 */
export function isLocalFsEnabled(): boolean {
  const flag = process.env.DTS_LOCAL_FS;
  if (flag === "1" || flag === "true") return true;
  if (flag === "0" || flag === "false") return false;
  return process.env.NODE_ENV !== "production";
}

function getVaultOwnerDir(vaultOwnerId?: string): string {
  const ownerId = vaultOwnerId === undefined ? DEFAULT_LOCAL_VAULT_OWNER : vaultOwnerId;
  if (typeof ownerId !== "string" || !OWNER_IDENTIFIER.test(ownerId)) {
    throw new LocalArtifactPathError("owner identifier");
  }
  return resolveLocalArtifactPath(DATA_DIR, [
    {
      role: "owner identifier",
      value: ownerId,
    },
  ]);
}

function getArtifactFilePath(root: string, filename: string): string {
  return resolveLocalArtifactPath(root, [{ role: "filename", value: filename }]);
}

function rethrowLocalArtifactPathError(error: unknown): void {
  if (error instanceof LocalArtifactPathError) {
    throw error;
  }
}

/**
 * Ensure directory exists
 */
export async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch {
    // Directory might already exist
  }
}

/**
 * Get path to a person's directory
 */
export function getPersonDir(personId: string, vaultOwnerId?: string): string {
  return resolveLocalArtifactPath(getVaultOwnerDir(vaultOwnerId), [
    { role: "person identifier", value: personId },
  ]);
}

/**
 * Get path to a person's runs directory
 */
export function getRunsDir(personId: string, vaultOwnerId?: string): string {
  return resolveLocalArtifactPath(getPersonDir(personId, vaultOwnerId), [
    { role: "path segment", value: "runs" },
  ]);
}

/**
 * Get path to a specific run
 */
export function getRunDir(personId: string, runId: string, vaultOwnerId?: string): string {
  return resolveLocalArtifactPath(getRunsDir(personId, vaultOwnerId), [
    { role: "run identifier", value: runId },
  ]);
}

/** Pure path builder used by both AI-stage reads and writes. */
export function getAIStageFilePath(
  personId: string,
  runId: string,
  stage: string,
  filename: string,
  vaultOwnerId?: string
): string {
  const stageDir = resolveLocalArtifactPath(getRunDir(personId, runId, vaultOwnerId), [
    { role: "path segment", value: "ai-stages" },
    { role: "stage identifier", value: stage },
  ]);
  return resolveLocalArtifactPath(stageDir, [{ role: "filename", value: filename }]);
}

/**
 * List all people with stored data
 */
export async function listPeople(vaultOwnerId?: string): Promise<PersonMetadata[]> {
  try {
    const ownerDir = getVaultOwnerDir(vaultOwnerId);
    await ensureDir(ownerDir);
    const entries = await fs.readdir(ownerDir, { withFileTypes: true });
    const people: PersonMetadata[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        try {
          const personDir = resolveLocalArtifactPath(ownerDir, [
            { role: "person identifier", value: entry.name },
          ]);
          const personPath = getArtifactFilePath(personDir, "person.json");
          const content = await fs.readFile(personPath, "utf-8");
          people.push(JSON.parse(content));
        } catch {
          // Skip if person.json doesn't exist
        }
      }
    }

    return people.sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  } catch (error) {
    rethrowLocalArtifactPathError(error);
    return [];
  }
}

/**
 * Get a person's metadata
 */
export async function getPerson(personId: string, vaultOwnerId?: string): Promise<PersonMetadata | null> {
  try {
    const personPath = getArtifactFilePath(getPersonDir(personId, vaultOwnerId), "person.json");
    const content = await fs.readFile(personPath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    rethrowLocalArtifactPathError(error);
    return null;
  }
}

/**
 * Save a person's metadata
 */
export async function savePerson(person: PersonMetadata, vaultOwnerId?: string): Promise<void> {
  if (!isLocalFsEnabled()) return;
  const personDir = getPersonDir(person.familySearchId, vaultOwnerId);
  await ensureDir(personDir);
  const personPath = getArtifactFilePath(personDir, "person.json");
  await fs.writeFile(personPath, JSON.stringify(person, null, 2));
}

/**
 * List runs for a person
 */
export async function listRuns(personId: string, vaultOwnerId?: string): Promise<RunMetadata[]> {
  try {
    const runsDir = getRunsDir(personId, vaultOwnerId);
    await ensureDir(runsDir);
    const entries = await fs.readdir(runsDir, { withFileTypes: true });
    const runs: RunMetadata[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        try {
          const runDir = resolveLocalArtifactPath(runsDir, [
            { role: "run identifier", value: entry.name },
          ]);
          const packPath = getArtifactFilePath(runDir, "evidence-pack.json");
          const content = await fs.readFile(packPath, "utf-8");
          const pack = JSON.parse(content);
          runs.push({
            runId: pack.runId,
            capturedAt: pack.capturedAt,
            extractorVersion: pack.extractorVersion,
            mode: pack.diagnostics?.mode || "standard",
            totalSources: pack.sources?.length || 0,
            expandedSections: pack.diagnostics?.expandedSections || 0,
          });
        } catch {
          // Skip if evidence-pack.json doesn't exist
        }
      }
    }

    return runs.sort((a, b) => 
      new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime()
    );
  } catch (error) {
    rethrowLocalArtifactPathError(error);
    return [];
  }
}

/**
 * Get the latest run pointer
 */
export async function getLatestRun(personId: string, vaultOwnerId?: string): Promise<LatestPointer | null> {
  try {
    const latestPath = getArtifactFilePath(getPersonDir(personId, vaultOwnerId), "latest.json");
    const content = await fs.readFile(latestPath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    rethrowLocalArtifactPathError(error);
    return null;
  }
}

/**
 * Set the latest run pointer
 */
export async function setLatestRun(personId: string, runId: string, vaultOwnerId?: string): Promise<void> {
  if (!isLocalFsEnabled()) return;
  const latestPath = getArtifactFilePath(getPersonDir(personId, vaultOwnerId), "latest.json");
  const pointer: LatestPointer = {
    runId,
    runPath: getRunDir(personId, runId, vaultOwnerId),
  };
  await fs.writeFile(latestPath, JSON.stringify(pointer, null, 2));
}

/**
 * Save a legacy evidence pack artifact
 */
export async function saveEvidencePack(
  personId: string, 
  runId: string, 
  evidencePack: unknown,
  vaultOwnerId?: string
): Promise<string> {
  const runDir = getRunDir(personId, runId, vaultOwnerId);
  if (!isLocalFsEnabled()) return runDir;
  await ensureDir(runDir);

  const packPath = getArtifactFilePath(runDir, "evidence-pack.json");
  await fs.writeFile(packPath, JSON.stringify(evidencePack, null, 2));

  return runDir;
}

/**
 * Save a capture package artifact
 */
export async function saveCapturePackage(
  personId: string,
  runId: string,
  capturePackage: unknown,
  vaultOwnerId?: string
): Promise<string> {
  const runDir = getRunDir(personId, runId, vaultOwnerId);
  const capturePath = getArtifactFilePath(runDir, "capture-package.json");
  if (!isLocalFsEnabled()) return capturePath;
  await ensureDir(runDir);

  await fs.writeFile(capturePath, JSON.stringify(capturePackage, null, 2));

  return capturePath;
}

/**
 * Get a capture package artifact
 */
export async function getCapturePackage(personId: string, runId: string, vaultOwnerId?: string): Promise<unknown | null> {
  try {
    const capturePath = getArtifactFilePath(
      getRunDir(personId, runId, vaultOwnerId),
      "capture-package.json"
    );
    const content = await fs.readFile(capturePath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    rethrowLocalArtifactPathError(error);
    return null;
  }
}

/**
 * Get a legacy evidence pack artifact
 */
export async function getEvidencePack(personId: string, runId: string, vaultOwnerId?: string): Promise<unknown | null> {
  try {
    const packPath = getArtifactFilePath(
      getRunDir(personId, runId, vaultOwnerId),
      "evidence-pack.json"
    );
    const content = await fs.readFile(packPath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    rethrowLocalArtifactPathError(error);
    return null;
  }
}

/**
 * Save a raw document
 */
export async function saveRawDocument(
  personId: string,
  runId: string,
  markdown: string,
  vaultOwnerId?: string
): Promise<void> {
  if (!isLocalFsEnabled()) return;
  const runDir = getRunDir(personId, runId, vaultOwnerId);
  await ensureDir(runDir);
  const docPath = getArtifactFilePath(runDir, "raw-document.md");
  await fs.writeFile(docPath, markdown);
}

/**
 * Get a raw document
 */
export async function getRawDocument(
  personId: string,
  runId: string,
  vaultOwnerId?: string
): Promise<string | null> {
  try {
    const docPath = getArtifactFilePath(
      getRunDir(personId, runId, vaultOwnerId),
      "raw-document.md"
    );
    return await fs.readFile(docPath, "utf-8");
  } catch (error) {
    rethrowLocalArtifactPathError(error);
    return null;
  }
}

/**
 * Save a contextualized document
 */
export async function saveContextualizedDocument(
  personId: string,
  runId: string,
  markdown: string,
  vaultOwnerId?: string
): Promise<void> {
  if (!isLocalFsEnabled()) return;
  const runDir = getRunDir(personId, runId, vaultOwnerId);
  await ensureDir(runDir);
  const docPath = getArtifactFilePath(runDir, "contextualized.md");
  await fs.writeFile(docPath, markdown);
}

/**
 * Get a contextualized document
 */
export async function getContextualizedDocument(
  personId: string,
  runId: string,
  vaultOwnerId?: string
): Promise<string | null> {
  try {
    const docPath = getArtifactFilePath(
      getRunDir(personId, runId, vaultOwnerId),
      "contextualized.md"
    );
    return await fs.readFile(docPath, "utf-8");
  } catch (error) {
    rethrowLocalArtifactPathError(error);
    return null;
  }
}

/**
 * Save AI stage output
 */
export async function saveAIStageOutput(
  personId: string,
  runId: string,
  stage: string,
  filename: string,
  data: unknown,
  vaultOwnerId?: string
): Promise<void> {
  if (!isLocalFsEnabled()) return;
  const filePath = getAIStageFilePath(personId, runId, stage, filename, vaultOwnerId);
  const stageDir = path.dirname(filePath);
  await ensureDir(stageDir);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

/**
 * Get AI stage output
 */
export async function getAIStageOutput(
  personId: string,
  runId: string,
  stage: string,
  filename: string,
  vaultOwnerId?: string
): Promise<unknown | null> {
  try {
    const filePath = getAIStageFilePath(personId, runId, stage, filename, vaultOwnerId);
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    rethrowLocalArtifactPathError(error);
    return null;
  }
}
