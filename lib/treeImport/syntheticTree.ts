/**
 * A synthetic family tree for whole-tree import tests.
 *
 * Deterministic and entirely invented: no real person, place record or
 * FamilySearch id. It is shaped like a real FamilySearch tree so the import is
 * exercised the way a person's AI will use it:
 *   - a root person and ten generations of direct ancestors,
 *   - brothers and sisters on every ancestral couple, with spouses, children
 *     and grandchildren (the cousins),
 *   - several named types (birth name, married name, nickname),
 *   - facts with dates and places (birth, christening, marriage, census,
 *     occupation, burial, death, and one custom type),
 *   - couple rows with marriage facts, and one ParentChild row per parent with
 *     a lineage (a few adopted or step),
 *   - sources, citations with page and GEDCOM quality on people and facts,
 *     notes on people, facts and relationships, and photo references.
 */
import type {
  CitationInput,
  MediaInput,
  NoteInput,
  PersonInput,
  RelationshipInput,
  SourceInput,
  TreeImportBatch,
} from "./model";
import { TREE_IMPORT_KINDS } from "./model";

export type SyntheticTree = Required<TreeImportBatch>;

const GIVEN_MALE = ["Jan", "Stefan", "Tomas", "Ole", "Henrik", "Matti", "Pieter", "Aldo", "Emil", "Ivo", "Lars", "Bram"];
const GIVEN_FEMALE = ["Maria", "Anna", "Elin", "Sofie", "Katarina", "Ilse", "Marta", "Greta", "Liv", "Noor", "Ada", "Vera"];
const SURNAMES = ["Kowalczyk", "Lindqvist", "Varga", "Okafor", "Brennan", "Haugen", "De Vries", "Moretti", "Novak", "Sato", "Ferreira", "Aalto", "Dubois", "Kaur", "Mbeki", "Ortega"];
const PLACES = ["Synthetic Township, North County", "Example Parish, West Shire", "Placeholder Village, East Province", "Testford, South District", "Fixture City, Central Region"];

/** A small deterministic PRNG (mulberry32), so every run builds the same tree. */
function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function syntheticPid(n: number): string {
  // Shaped like a FamilySearch PID (XXXX-XXX) but always prefixed SYN.
  return `SYN${String(n).padStart(5, "0")}`;
}

export function generateSyntheticTree(options: { people: number; seed?: number; generations?: number }): SyntheticTree {
  const random = rng(options.seed ?? 20261021);
  const pick = <T,>(values: readonly T[]) => values[Math.floor(random() * values.length)];
  const tree: SyntheticTree = { sources: [], persons: [], relationships: [], media: [], citations: [], notes: [] };
  const born = new Map<string, number>();
  let n = 0;

  const addPerson = (sex: "male" | "female", surname: string, birthYear: number, maidenOf?: string): string => {
    n += 1;
    const key = syntheticPid(n);
    const given = sex === "male" ? pick(GIVEN_MALE) : pick(GIVEN_FEMALE);
    const place = pick(PLACES);
    const living = birthYear > 1945;
    const deathYear = living ? undefined : birthYear + 40 + Math.floor(random() * 45);
    const names: PersonInput["names"] = [{ type: "birth", given, surname: maidenOf ?? surname, preferred: true }];
    if (maidenOf && maidenOf !== surname) names.push({ type: "married", given, surname });
    if (n % 7 === 0) names.push({ type: "nickname", given: `${given.slice(0, 3)}ie`, surname: maidenOf ?? surname });
    const facts: NonNullable<PersonInput["facts"]> = [
      { key: "birth", type: "http://gedcomx.org/Birth", date: { original: `${1 + (n % 28)} Mar ${birthYear}`, year: birthYear, month: 3, day: 1 + (n % 28) }, place: { original: place } },
    ];
    if (n % 3 === 0) facts.push({ key: "chr", type: "CHR", date: { original: `${birthYear}` }, place: { original: place } });
    if (birthYear > 1850 && birthYear < 1940) facts.push({ key: "census-1950", type: "Census", date: { original: "1950" }, place: { original: pick(PLACES) } });
    if (n % 4 === 0) facts.push({ key: "occupation", type: "OCCU", value: pick(["farmer", "weaver", "teacher", "miner", "seamstress", "clerk"]) });
    if (n % 97 === 0) facts.push({ key: "custom", type: "Guild Membership", date: { original: `abt ${birthYear + 25}`, approximate: true } });
    if (deathYear !== undefined) {
      facts.push({ key: "death", type: "DEAT", date: { original: `${deathYear}`, year: deathYear }, place: { original: place } });
      if (n % 2 === 0) facts.push({ key: "burial", type: "BURI", date: { original: `${deathYear}` }, place: { original: `${place} Cemetery` } });
    }
    tree.persons.push({ key, names, sex, living, facts, sourceUrl: `https://example.test/tree/person/${key}` });
    born.set(key, birthYear);

    // Every fifth person has their own source and a citation on their birth.
    if (n % 5 === 0) {
      const sourceKey = `SRC-${key}`;
      tree.sources.push({
        key: sourceKey,
        title: `${birthYear} parish register, ${place}`,
        type: "church_record",
        repository: "Synthetic Archive",
        url: `https://example.test/ark/${sourceKey}`,
        citationText: `"Parish register," database, Synthetic Archive, entry for ${given} ${surname}, ${birthYear}.`,
        recordDate: String(birthYear),
        recordPlace: place,
      });
      tree.citations.push({
        key: `CIT-${key}-birth`,
        sourceKey,
        page: `folio ${n % 300}, entry ${n % 40}`,
        quality: (n % 4) as 0 | 1 | 2 | 3,
        extractedText: `${given}, child of the household, born ${birthYear}.`,
        targets: [{ kind: "person", key, field: "name" }, { kind: "fact", personKey: key, key: "birth" }],
      });
    }
    if (n % 10 === 0) {
      tree.notes.push({ key: `NOTE-${key}`, text: `Family recollection about ${given}: kept the synthetic orchard.`, noteType: "biography", subject: { kind: "person", key } });
    }
    if (n % 25 === 0 && deathYear !== undefined) {
      tree.notes.push({ key: `NOTE-${key}-death`, text: "Death date taken from a later family letter; not yet checked against a register.", noteType: "research", subject: { kind: "fact", personKey: key, key: "death" } });
    }
    if (n % 50 === 0) {
      tree.media.push({ key: `MEM-${key}`, title: `Portrait of ${given} ${surname}`, type: "photo", url: `https://example.test/memories/${key}`, personKeys: [key] });
    }
    return key;
  };

  const addCouple = (husband: string, wife: string) => {
    const key = `REL-C-${husband}-${wife}`;
    const year = (born.get(husband) ?? 1900) + 24;
    tree.relationships.push({
      key,
      type: "Couple",
      person1Key: husband,
      person2Key: wife,
      facts: [{ type: "Marriage", date: { original: `${year}`, year }, place: { original: pick(PLACES) } }],
    });
    if (tree.relationships.length % 40 === 0) {
      tree.notes.push({ key: `NOTE-${key}`, text: "Marriage banns read three times.", noteType: "source", subject: { kind: "relationship", key } });
    }
  };

  const addChild = (father: string, mother: string, child: string) => {
    const lineage: RelationshipInput["lineage"] = n % 61 === 0 ? "adopted" : n % 83 === 0 ? "step" : "biological";
    tree.relationships.push({ key: `REL-F-${father}-${child}`, type: "ParentChild", person1Key: father, person2Key: child, lineage });
    tree.relationships.push({ key: `REL-M-${mother}-${child}`, type: "ParentChild", person1Key: mother, person2Key: child, lineage });
  };

  const generations = options.generations ?? 10;
  const root = addPerson("male", pick(SURNAMES), 1950);
  const couples: Array<{ father: string; mother: string; surname: string; year: number; generation: number; child: string }> = [];

  // Direct ancestors, breadth first.
  let frontier: Array<{ key: string; surname: string; year: number; generation: number }> = [{ key: root, surname: tree.persons[0].names[0].surname!, year: 1950, generation: 0 }];
  while (frontier.length && n < options.people) {
    const next: typeof frontier = [];
    for (const person of frontier) {
      if (person.generation >= generations || n + 2 > options.people) continue;
      const year = person.year - 28;
      const father = addPerson("male", person.surname, year);
      const motherSurname = pick(SURNAMES);
      const mother = addPerson("female", person.surname, year + 2, motherSurname);
      addCouple(father, mother);
      addChild(father, mother, person.key);
      couples.push({ father, mother, surname: person.surname, year, generation: person.generation + 1, child: person.key });
      next.push({ key: father, surname: person.surname, year, generation: person.generation + 1 });
      next.push({ key: mother, surname: motherSurname, year: year + 2, generation: person.generation + 1 });
    }
    frontier = next;
  }

  // Collateral lines: siblings of the direct line, their spouses, children and grandchildren.
  let round = 0;
  while (n < options.people && round < 6) {
    for (const couple of couples) {
      if (n >= options.people) break;
      const siblingSex = random() < 0.5 ? "male" : "female";
      const sibling = addPerson(siblingSex, couple.surname, couple.year + 26 + round * 2);
      addChild(couple.father, couple.mother, sibling);
      if (n + 3 > options.people) continue;
      const spouseSurname = pick(SURNAMES);
      const spouse = siblingSex === "male"
        ? addPerson("female", couple.surname, couple.year + 27, spouseSurname)
        : addPerson("male", spouseSurname, couple.year + 25);
      const husband = siblingSex === "male" ? sibling : spouse;
      const wife = siblingSex === "male" ? spouse : sibling;
      addCouple(husband, wife);
      const familySurname = siblingSex === "male" ? couple.surname : spouseSurname;
      const cousin = addPerson(random() < 0.5 ? "male" : "female", familySurname, couple.year + 52 + round);
      addChild(husband, wife, cousin);
    }
    round += 1;
  }
  return tree;
}

/**
 * Pack a tree into import batches the way an AI should send them: every kind
 * in dependency order (sources, then people, then the rows that point at
 * people), never more than `size` records per batch.
 */
export function packBatches(tree: SyntheticTree, size: number): TreeImportBatch[] {
  const batches: TreeImportBatch[] = [];
  let current: TreeImportBatch = {};
  let count = 0;
  for (const kind of TREE_IMPORT_KINDS) {
    for (const item of tree[kind] as Array<SourceInput | PersonInput | RelationshipInput | MediaInput | CitationInput | NoteInput>) {
      if (count === size) {
        batches.push(current);
        current = {};
        count = 0;
      }
      ((current[kind] ??= []) as unknown[]).push(item);
      count += 1;
    }
  }
  if (count > 0) batches.push(current);
  return batches;
}
