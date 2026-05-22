import { readFileSync } from "fs";
import path from "path";
import {
  FIRST_USEFUL_RESEARCH_PACK_ID,
  LOCALITY_ERA_TEMPLATE_VERSION,
  localityEraBriefCategories,
  researchPackTemplates,
  type ResearchPackCategory,
  type ResearchPackTemplate,
  type ResearchPackType,
} from "../lib/context/researchPacks";

const expectedTypes: ResearchPackType[] = [
  "locality_era_brief",
  "region_era",
  "occupation_era",
  "religion_community",
  "migration_corridor",
  "building_institution",
  "local_event",
  "cemetery_burial",
];

const failures: string[] = [];
const ids = new Set<string>();
const expectedLocalityCategories: ResearchPackCategory[] = [
  "scope",
  "place_summary",
  "daily_life",
  "institutions",
  "migration_work_religion",
  "evidence_limits",
  "story_synthesis",
];

function requireList(template: ResearchPackTemplate, key: keyof ResearchPackTemplate) {
  const value = template[key];
  if (!Array.isArray(value) || value.length === 0) {
    failures.push(`${template.id}: ${String(key)} must be a non-empty list`);
  }
}

for (const template of researchPackTemplates) {
  if (ids.has(template.id)) {
    failures.push(`${template.id}: duplicate template id`);
  }
  ids.add(template.id);

  if (!template.label.trim()) failures.push(`${template.id}: missing label`);
  if (!template.purpose.trim()) failures.push(`${template.id}: missing purpose`);

  requireList(template, "appliesWhen");
  requireList(template, "requiredInputs");
  requireList(template, "researchQuestions");
  requireList(template, "outputSections");
  requireList(template, "attachmentModel");
  requireList(template, "evidenceBoundary");
  requireList(template, "privacyNotes");
  requireList(template, "storyWriterUse");

  const evidenceText = template.evidenceBoundary.join(" ").toLowerCase();
  if (!evidenceText.includes("source") && !evidenceText.includes("evidence")) {
    failures.push(`${template.id}: evidence boundary must mention source or evidence limits`);
  }

  const attachmentTargets = new Set(template.attachmentModel.map((entry) => entry.target));
  if (!attachmentTargets.has("place") && !attachmentTargets.has("person") && !attachmentTargets.has("context_item")) {
    failures.push(`${template.id}: attachment model must include a place, person, or context_item target`);
  }
}

for (const type of expectedTypes) {
  if (!researchPackTemplates.some((template) => template.packType === type)) {
    failures.push(`Missing template for pack type ${type}`);
  }
}

const firstUsefulTemplates = researchPackTemplates.filter((template) => template.firstUseful);
if (firstUsefulTemplates.length !== 1) {
  failures.push(`Expected exactly one first-useful template, found ${firstUsefulTemplates.length}`);
} else if (firstUsefulTemplates[0].id !== FIRST_USEFUL_RESEARCH_PACK_ID) {
  failures.push(`First useful template must be ${FIRST_USEFUL_RESEARCH_PACK_ID}`);
}

if (LOCALITY_ERA_TEMPLATE_VERSION !== "locality-era/v1") {
  failures.push("Locality Era Brief template version must remain explicit");
}

for (const category of expectedLocalityCategories) {
  if (!localityEraBriefCategories.some((entry) => entry.category === category)) {
    failures.push(`Missing locality era category ${category}`);
  }
}

const doc = readFileSync(path.join(process.cwd(), "docs/context/place-era-research-packs.md"), "utf8");
for (const term of [
  "Locality Era Brief",
  "historicalContext",
  "contextItems",
  "not canonical person facts",
  "AI synthesis",
  "categoryBlocks",
  "reviewed, non-private",
  "Privacy Boundary",
  "Implementation Follow-Ups",
]) {
  if (!doc.includes(term)) {
    failures.push(`docs/context/place-era-research-packs.md missing ${term}`);
  }
}

if (failures.length > 0) {
  console.error("Place/era research pack checks failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Place/era research pack checks passed.");
