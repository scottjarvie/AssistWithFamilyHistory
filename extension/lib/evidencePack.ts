export interface RelatedPerson {
  familySearchId?: string;
  name: string;
  role?: string;
}

export interface PlaceMention {
  familySearchId?: string;
  name: string;
  fullName?: string;
  role?: string;
}

export interface Source {
  id: string;
  orderIndex: number;
  sourceKey: string;
  sourceType: "record" | "memory" | "story" | "photo" | "other";
  title: string;
  date?: string;
  citation?: string;
  webPageUrl?: string;
  attachedBy?: string;
  attachedAt?: string;
  reasonAttached?: string;
  tags: string[];
  indexed: {
    fields: Array<{
      label: string;
      labelRaw?: string;
      value: string;
    }>;
    textBlocks: string[];
  };
  rawText: string;
  expanded: boolean;
  expansionAttempts: number;
  expansionSucceeded: boolean;
  relatedPeople: RelatedPerson[];
  placeMentions: PlaceMention[];
  outboundUrls: string[];
}

export interface MemoryItem {
  id: string;
  title: string;
  description?: string;
  mediaType?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  memoryUrl?: string;
  familySearchUrl?: string;
  createdAt?: string;
  attachedBy?: string;
  relatedPeople: RelatedPerson[];
  placeMentions: PlaceMention[];
}

export interface Warning {
  code: string;
  message: string;
  sourceId?: string;
}

export interface ExtractorError {
  code: string;
  message: string;
  fatal: boolean;
}

export interface CapturePackage {
  schemaVersion: "2.0";
  captureId: string;
  capturedAt: string;
  extractorVersion: string;
  extractionDurationMs: number;
  pageType: "sources" | "memories" | "person";
  pageUrl: string;
  pageTitle: string;
  uiLocale: string;
  person: {
    familySearchId: string;
    name: string;
    birthDate?: string;
    deathDate?: string;
    portraitUrl?: string;
  };
  sources: Source[];
  memories: MemoryItem[];
  placeMentions: PlaceMention[];
  diagnostics: {
    mode: "standard" | "admin";
    totalSources: number;
    totalMemories: number;
    expandedSections: number;
    failedExpansions: number;
    warnings: Warning[];
    errors: ExtractorError[];
  };
}

export function validateEvidencePack(data: unknown): data is CapturePackage {
  if (!data || typeof data !== "object") return false;

  const pack = data as Record<string, unknown>;
  return (
    pack.schemaVersion === "2.0" &&
    typeof pack.captureId === "string" &&
    typeof pack.capturedAt === "string" &&
    typeof pack.pageType === "string" &&
    Array.isArray(pack.sources) &&
    Array.isArray(pack.memories)
  );
}

export function createEmptyEvidencePack(): CapturePackage {
  return {
    schemaVersion: "2.0",
    captureId: "",
    capturedAt: new Date().toISOString(),
    extractorVersion: "2.0.0",
    extractionDurationMs: 0,
    pageType: "sources",
    pageUrl: "",
    pageTitle: "",
    uiLocale: "en",
    person: {
      familySearchId: "",
      name: "",
    },
    sources: [],
    memories: [],
    placeMentions: [],
    diagnostics: {
      mode: "standard",
      totalSources: 0,
      totalMemories: 0,
      expandedSections: 0,
      failedExpansions: 0,
      warnings: [],
      errors: [],
    },
  };
}

