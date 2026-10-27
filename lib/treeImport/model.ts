/**
 * Whole-tree import: the pure parts.
 *
 * A person's AI walks their tree on a genealogy site (FamilySearch first) and
 * sends it here in batches. Everything in this module is deterministic and
 * free of Convex so the mapping rules can be tested on their own and read by
 * the planning doc: docs/planning/whole-tree-import-2026-10.md.
 *
 * Every imported record is keyed by the id it has on the outside site
 * (a FamilySearch PID, a source id, a GEDCOM xref). Sending the same key again
 * updates the same record; it never makes a second copy.
 */

export const TREE_IMPORT_KINDS = ["sources", "persons", "relationships", "media", "citations", "notes"] as const;
export type TreeImportKind = (typeof TREE_IMPORT_KINDS)[number];

/** Singular names used in record keys and per-item results. */
export const TREE_IMPORT_KIND_SINGULAR: Record<TreeImportKind, string> = {
  sources: "source",
  persons: "person",
  relationships: "relationship",
  media: "media",
  citations: "citation",
  notes: "note",
};

export const TREE_IMPORT_LIMITS = {
  /** Records of every kind together in one batch call. */
  recordsPerBatch: 500,
  /**
   * Work units per Convex transaction. A person costs 1 + its facts, a
   * citation 1 + its targets. Kept well under Convex's per-transaction
   * read/write/time ceilings so a 500-record batch of rich people still fits.
   */
  chunkWeight: 250,
  factsPerPerson: 60,
  namesPerPerson: 20,
  targetsPerCitation: 30,
  failuresKeptPerBatch: 50,
  duplicateCandidatesPerPerson: 3,
  duplicateScanPerPerson: 12,
  batchesShown: 20,
  noteText: 20_000,
  cursor: 500,
  key: 200,
  system: 40,
} as const;

export type ExternalId = { system: string; id: string; url?: string };

export type DateInput = {
  original: string;
  formal?: string;
  year?: number;
  month?: number;
  day?: number;
  approximate?: boolean;
};

export type PlaceInput = { original: string };

export type NameInput = {
  type?: string;
  given?: string;
  surname?: string;
  prefix?: string;
  suffix?: string;
  nickname?: string;
  preferred?: boolean;
};

export type FactInput = {
  key?: string;
  type: string;
  date?: DateInput;
  place?: PlaceInput;
  value?: string;
  description?: string;
};

export type PersonInput = {
  key: string;
  otherIds?: ExternalId[];
  names: NameInput[];
  sex?: "male" | "female" | "unknown";
  living: boolean;
  facts?: FactInput[];
  tags?: string[];
  sourceUrl?: string;
};

export type RelationshipInput = {
  key: string;
  type: "Couple" | "ParentChild";
  person1Key: string;
  person2Key: string;
  lineage?: "biological" | "adopted" | "step" | "foster" | "guardianship" | "unknown";
  facts?: Array<{ type: string; date?: DateInput; place?: PlaceInput; description?: string }>;
  otherIds?: ExternalId[];
};

export type SourceInput = {
  key: string;
  title: string;
  type?: string;
  repository?: string;
  url?: string;
  author?: string;
  publicationDate?: string;
  citationText?: string;
  recordDate?: string;
  recordPlace?: string;
  notes?: string;
  otherIds?: ExternalId[];
};

export type TargetInput = {
  kind: "person" | "relationship" | "fact" | "note" | "media";
  key: string;
  /** For kind "fact": the person the fact belongs to. */
  personKey?: string;
  /** For kind "person": which part of the person, e.g. "birth" or "name". */
  field?: string;
};

export type CitationInput = {
  key?: string;
  sourceKey: string;
  page?: string;
  /** GEDCOM QUAY: 0 unreliable, 1 questionable, 2 secondary, 3 direct/primary. */
  quality?: 0 | 1 | 2 | 3;
  extractedText?: string;
  url?: string;
  accessDate?: string;
  notes?: string;
  targets: TargetInput[];
};

export type NoteInput = {
  key: string;
  title?: string;
  text: string;
  noteType?: "general" | "research" | "biography" | "transcription" | "source" | "other";
  subject: TargetInput | { kind: "source" | "citation"; key: string };
};

export type MediaInput = {
  key: string;
  title: string;
  type?: "photo" | "document" | "scan" | "video" | "audio" | "other";
  url?: string;
  description?: string;
  mimeType?: string;
  date?: { year?: number; month?: number; day?: number };
  personKeys?: string[];
  sourceKey?: string;
};

export type TreeImportBatch = {
  sources?: SourceInput[];
  persons?: PersonInput[];
  relationships?: RelationshipInput[];
  media?: MediaInput[];
  citations?: CitationInput[];
  notes?: NoteInput[];
};

export type TreeImportItem = { kind: TreeImportKind; index: number; item: any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/* -------------------------------------------------------------- record keys */

/** The durable lookup key for one outside record, namespaced by kind. */
export function externalRecordKey(system: string, singularKind: string, key: string): string {
  return `ext:${system.trim().toLowerCase()}:${singularKind}:${key.trim()}`;
}

/** Facts are keyed under their person, so "birth" on two people never collide. */
export function factKeyFor(personKey: string, fact: FactInput): string {
  if (fact.key?.trim()) return `${personKey.trim()}/${fact.key.trim()}`;
  return `${personKey.trim()}/${normalizeFactType(fact.type)}~${stableHash([
    fact.date?.original ?? "",
    fact.place?.original ?? "",
    fact.value ?? "",
  ].join("|"))}`;
}

/** A citation without its own outside id is keyed by what it says and points at. */
export function citationKeyFor(citation: CitationInput): string {
  if (citation.key?.trim()) return citation.key.trim();
  const targets = [...citation.targets]
    .map((target) => `${target.kind}:${target.personKey ?? ""}:${target.key}:${target.field ?? ""}`)
    .sort()
    .join(",");
  return `${citation.sourceKey.trim()}#${stableHash(`${citation.page ?? ""}|${targets}`)}`;
}

/** FNV-1a 64-bit, hex. Deterministic, synchronous and fine for record keys. */
export function stableHash(value: string): string {
  let hash = BigInt("0xcbf29ce484222325");
  const prime = BigInt("0x100000001b3");
  const mask = (BigInt(1) << BigInt(64)) - BigInt(1);
  for (let i = 0; i < value.length; i += 1) {
    hash ^= BigInt(value.charCodeAt(i));
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}

/* ---------------------------------------------------------------- vocabulary */

const EVENT_TYPES = new Set([
  "birth", "death", "burial", "baptism", "christening", "marriage", "divorce", "immigration", "emigration",
  "residence", "occupation", "military", "census", "naturalization", "probate", "land_record", "adoption",
  "engagement", "confirmation", "ordination", "religious_ordinance", "religious_membership", "education",
  "graduation", "retirement", "funeral", "cremation",
]);

/** GEDCOM 5.5/7 tags and GEDCOM X type URIs, mapped to the vault's event types. */
const FACT_ALIASES: Record<string, string> = {
  birt: "birth", deat: "death", buri: "burial", bapm: "baptism", chr: "christening", marr: "marriage",
  div: "divorce", immi: "immigration", emig: "emigration", resi: "residence", occu: "occupation",
  mili: "military", cens: "census", natu: "naturalization", prob: "probate", adop: "adoption",
  enga: "engagement", conf: "confirmation", ordn: "ordination", educ: "education", grad: "graduation",
  reti: "retirement", crem: "cremation", reli: "religious_membership", bapl: "religious_ordinance",
  endl: "religious_ordinance", slgc: "religious_ordinance", slgs: "religious_ordinance",
  militaryservice: "military", landtransaction: "land_record", land: "land_record",
  religion: "religious_membership", christening: "christening", baptism: "baptism",
};

export function normalizeFactType(raw: string): string {
  const trimmed = raw.trim();
  const tail = trimmed.includes("/") ? trimmed.slice(trimmed.lastIndexOf("/") + 1) : trimmed;
  return tail.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase() || "custom";
}

/** The vault event type for an outside fact type; unknown types stay readable as custom. */
export function eventTypeFor(raw: string): { type: string; customType?: string } {
  const normalized = normalizeFactType(raw);
  const compact = normalized.replace(/_/g, "");
  const mapped = FACT_ALIASES[compact] ?? FACT_ALIASES[normalized] ?? normalized;
  if (EVENT_TYPES.has(mapped)) return { type: mapped };
  return { type: "custom", customType: raw.trim().slice(0, 120) };
}

const SOURCE_TYPES = new Set([
  "census", "vital_record", "church_record", "military", "immigration", "newspaper", "obituary", "photograph",
  "letter", "book", "website", "repository", "collection", "headstone", "journal", "family_bible",
  "family_memory", "oral_history", "probate", "land", "court", "directory", "school", "employment", "map", "other",
]);

export function sourceTypeFor(raw: string | undefined): string {
  const normalized = raw ? normalizeFactType(raw) : "other";
  return SOURCE_TYPES.has(normalized) ? normalized : "other";
}

/** GEDCOM QUAY 0..3 onto the vault's five-step confidence. */
export function confidenceForQuality(quality: number | undefined): "very_high" | "high" | "medium" | "low" | "very_low" {
  switch (quality) {
    case 3: return "very_high";
    case 2: return "high";
    case 1: return "low";
    case 0: return "very_low";
    default: return "medium";
  }
}

export function childRelationTypeFor(lineage: RelationshipInput["lineage"]) {
  switch (lineage) {
    case "biological": return "Biological" as const;
    case "adopted": return "Adopted" as const;
    case "step": return "Step" as const;
    case "foster": return "Foster" as const;
    case "guardianship": return "Guardianship" as const;
    default: return lineage === undefined ? undefined : ("Unknown" as const);
  }
}

const NAME_TYPES: Record<string, string> = {
  birth: "BirthName", birthname: "BirthName", married: "MarriedName", marriedname: "MarriedName",
  aka: "AlsoKnownAs", alsoknownas: "AlsoKnownAs", nickname: "Nickname", religious: "ReligiousName",
  formal: "FormalName", adopted: "AdoptiveName", immigrant: "ImmigrantName", other: "Other",
};

export function nameTypeFor(raw: string | undefined): string {
  if (!raw) return "AlsoKnownAs";
  return NAME_TYPES[normalizeFactType(raw).replace(/_/g, "")] ?? raw.trim().slice(0, 80);
}

/** The preferred name becomes the person's name; every other name is kept with its type. */
export function splitNames(names: NameInput[]) {
  const primaryIndex = Math.max(0, names.findIndex((name) => name.preferred));
  const primary = names[primaryIndex] ?? {};
  return {
    name: {
      given: (primary.given ?? "").trim(),
      surname: (primary.surname ?? "").trim(),
      ...(primary.prefix ? { prefix: primary.prefix.trim() } : {}),
      ...(primary.suffix ? { suffix: primary.suffix.trim() } : {}),
      ...(primary.nickname ? { nickname: primary.nickname.trim() } : {}),
    },
    alternateNames: names
      .filter((_, index) => index !== primaryIndex)
      .map((name) => ({
        type: nameTypeFor(name.type),
        given: (name.given ?? "").trim(),
        surname: (name.surname ?? "").trim(),
        ...(name.prefix ? { prefix: name.prefix.trim() } : {}),
        ...(name.suffix ? { suffix: name.suffix.trim() } : {}),
      })),
  };
}

/** A year read from a structured date, or from the first four-digit run in its text. */
export function yearOf(date: DateInput | undefined): number | undefined {
  if (!date) return undefined;
  if (typeof date.year === "number") return date.year;
  const match = /(?:^|\D)(\d{4})(?:\D|$)/.exec(date.original);
  return match ? Number(match[1]) : undefined;
}

export function withYear(date: DateInput | undefined): DateInput | undefined {
  if (!date) return undefined;
  const year = yearOf(date);
  return year === undefined || date.year !== undefined ? date : { ...date, year };
}

/* ------------------------------------------------------------- duplicates */

export function foldName(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]+/g, " ")
    .trim()
    .split(/\s+/)[0] ?? "";
}

/**
 * Is an existing person worth suggesting as the same person?
 * Same folded surname (the index already guarantees it), same first given
 * name, and birth years within two. A suggestion only; nothing is merged.
 */
export function duplicateReason(
  incoming: { given: string; surname: string; birthYear?: number },
  existing: { given: string; surname: string; birthYear?: number },
): string | null {
  if (incoming.birthYear === undefined || existing.birthYear === undefined) return null;
  if (Math.abs(incoming.birthYear - existing.birthYear) > 2) return null;
  const a = foldName(incoming.given);
  const b = foldName(existing.given);
  if (!a || a !== b) return null;
  if (foldName(incoming.surname) !== foldName(existing.surname)) return null;
  return `Same first name and surname, born ${existing.birthYear === incoming.birthYear ? "the same year" : "within two years"} (${existing.birthYear}).`;
}

/* ---------------------------------------------------------------- batching */

export function itemWeight(kind: TreeImportKind, item: any): number { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (kind === "persons") return 2 + (Array.isArray(item?.facts) ? item.facts.length * 2 : 0);
  if (kind === "citations") return 1 + (Array.isArray(item?.targets) ? item.targets.length : 0);
  if (kind === "relationships") return 2;
  return 1;
}

export function countRecords(batch: TreeImportBatch): number {
  return TREE_IMPORT_KINDS.reduce((total, kind) => total + (batch[kind]?.length ?? 0), 0);
}

/**
 * Flatten a batch into dependency order (sources and people before the
 * relationships, citations and notes that point at them) and cut it into
 * transaction-sized chunks.
 */
export function chunkBatch(batch: TreeImportBatch, maxWeight: number = TREE_IMPORT_LIMITS.chunkWeight): TreeImportItem[][] {
  const chunks: TreeImportItem[][] = [];
  let current: TreeImportItem[] = [];
  let weight = 0;
  for (const kind of TREE_IMPORT_KINDS) {
    for (const [index, item] of (batch[kind] ?? []).entries()) {
      const cost = itemWeight(kind, item);
      if (current.length > 0 && weight + cost > maxWeight) {
        chunks.push(current);
        current = [];
        weight = 0;
      }
      current.push({ kind, index, item });
      weight += cost;
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/* ------------------------------------------------------------------ results */

export type ItemStatus = "created" | "updated" | "unchanged" | "linked" | "failed";

export type ItemResult = {
  kind: TreeImportKind;
  index: number;
  key: string;
  status: ItemStatus;
  id?: string;
  reason?: string;
  whatToDo?: string;
  /** Fields where the outside record and the vault disagree but the vault was kept. */
  kept?: string[];
  possibleDuplicates?: string[];
};

export type KindCounts = Record<ItemStatus, number>;
export type ImportCounts = Record<TreeImportKind, KindCounts>;

export function emptyCounts(): ImportCounts {
  const counts = {} as ImportCounts;
  for (const kind of TREE_IMPORT_KINDS) counts[kind] = { created: 0, updated: 0, unchanged: 0, linked: 0, failed: 0 };
  return counts;
}

export function addCounts(into: ImportCounts, results: readonly ItemResult[]): ImportCounts {
  const next = JSON.parse(JSON.stringify(into)) as ImportCounts;
  for (const result of results) next[result.kind][result.status] += 1;
  return next;
}
