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

function resolveVaultOwnerDir(vaultOwnerId?: string) {
  return (vaultOwnerId || DEFAULT_LOCAL_VAULT_OWNER).replace(/[^a-zA-Z0-9_-]/g, "_");
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
  return path.join(DATA_DIR, resolveVaultOwnerDir(vaultOwnerId), personId);
}

/**
 * Get path to a person's runs directory
 */
export function getRunsDir(personId: string, vaultOwnerId?: string): string {
  return path.join(getPersonDir(personId, vaultOwnerId), "runs");
}

/**
 * Get path to a specific run
 */
export function getRunDir(personId: string, runId: string, vaultOwnerId?: string): string {
  return path.join(getRunsDir(personId, vaultOwnerId), runId);
}

/**
 * List all people with stored data
 */
export async function listPeople(vaultOwnerId?: string): Promise<PersonMetadata[]> {
  try {
    const ownerDir = path.join(DATA_DIR, resolveVaultOwnerDir(vaultOwnerId));
    await ensureDir(ownerDir);
    const entries = await fs.readdir(ownerDir, { withFileTypes: true });
    const people: PersonMetadata[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const personPath = path.join(ownerDir, entry.name, "person.json");
        try {
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
  } catch {
    return [];
  }
}

/**
 * Get a person's metadata
 */
export async function getPerson(personId: string, vaultOwnerId?: string): Promise<PersonMetadata | null> {
  try {
    const personPath = path.join(getPersonDir(personId, vaultOwnerId), "person.json");
    const content = await fs.readFile(personPath, "utf-8");
    return JSON.parse(content);
  } catch {
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
  const personPath = path.join(personDir, "person.json");
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
        const packPath = path.join(runsDir, entry.name, "evidence-pack.json");
        try {
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
  } catch {
    return [];
  }
}

/**
 * Get the latest run pointer
 */
export async function getLatestRun(personId: string, vaultOwnerId?: string): Promise<LatestPointer | null> {
  try {
    const latestPath = path.join(getPersonDir(personId, vaultOwnerId), "latest.json");
    const content = await fs.readFile(latestPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Set the latest run pointer
 */
export async function setLatestRun(personId: string, runId: string, vaultOwnerId?: string): Promise<void> {
  if (!isLocalFsEnabled()) return;
  const latestPath = path.join(getPersonDir(personId, vaultOwnerId), "latest.json");
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

  const packPath = path.join(runDir, "evidence-pack.json");
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
  const capturePath = path.join(runDir, "capture-package.json");
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
    const capturePath = path.join(getRunDir(personId, runId, vaultOwnerId), "capture-package.json");
    const content = await fs.readFile(capturePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Get a legacy evidence pack artifact
 */
export async function getEvidencePack(personId: string, runId: string, vaultOwnerId?: string): Promise<unknown | null> {
  try {
    const packPath = path.join(getRunDir(personId, runId, vaultOwnerId), "evidence-pack.json");
    const content = await fs.readFile(packPath, "utf-8");
    return JSON.parse(content);
  } catch {
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
  const docPath = path.join(runDir, "raw-document.md");
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
    const docPath = path.join(getRunDir(personId, runId, vaultOwnerId), "raw-document.md");
    return await fs.readFile(docPath, "utf-8");
  } catch {
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
  const docPath = path.join(runDir, "contextualized.md");
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
    const docPath = path.join(getRunDir(personId, runId, vaultOwnerId), "contextualized.md");
    return await fs.readFile(docPath, "utf-8");
  } catch {
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
  const stageDir = path.join(getRunDir(personId, runId, vaultOwnerId), "ai-stages", stage);
  await ensureDir(stageDir);
  const filePath = path.join(stageDir, filename);
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
    const filePath = path.join(
      getRunDir(personId, runId, vaultOwnerId), 
      "ai-stages", 
      stage, 
      filename
    );
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}
