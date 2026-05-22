export type ExperimentVisibility = "hidden" | "beta" | "public";
export type ExperimentMaturity = "concept" | "prototype" | "pilot";
export type ExperimentPrivacyRisk = "low" | "medium" | "high";
export type ExperimentLaunchState = "available" | "flagged" | "planned";

export type ExperimentDefinition = {
  id: string;
  title: string;
  summary: string;
  purpose: string;
  visibility: ExperimentVisibility;
  maturity: ExperimentMaturity;
  privacyRisk: ExperimentPrivacyRisk;
  requiredData: string[];
  relatedIssues: string[];
  launch: {
    state: ExperimentLaunchState;
    href?: string;
    flag?: string;
  };
  privacyNotes: string[];
  reviewSignals: string[];
};

export const experimentDefinitions = [
  {
    id: "familysearch-capture-bench",
    title: "FamilySearch Capture Bench",
    summary: "Review capture packages, validation reports, and import readiness before vault merge.",
    purpose:
      "Keep FamilySearch source and memory intake disciplined while browser capture remains user-mediated.",
    visibility: "public",
    maturity: "pilot",
    privacyRisk: "medium",
    requiredData: ["Anonymized or user-reviewed FamilySearch capture package", "Owner-scoped vault"],
    relatedIssues: ["GEN-59"],
    launch: {
      state: "available",
      href: "/app/imports",
    },
    privacyNotes: [
      "Raw capture packages stay review-first.",
      "Living-person and private-memory details must not be copied into repo fixtures.",
    ],
    reviewSignals: ["Validation report copied", "Import warnings reviewed", "Vault merge verified"],
  },
  {
    id: "place-era-research-packs",
    title: "Place And Era Research Packs",
    summary: "Prepare reusable context packets for towns, time periods, occupations, migrations, and local events.",
    purpose:
      "Give story writers responsible historical context without mixing general background into source-backed facts.",
    visibility: "beta",
    maturity: "concept",
    privacyRisk: "low",
    requiredData: ["Place records", "Event dates", "Source citations or context reports"],
    relatedIssues: ["GEN-32"],
    launch: {
      state: "planned",
    },
    privacyNotes: [
      "Context packs should cite public history sources or reviewed vault context.",
      "Generated context should remain separate from evidence-backed person facts.",
    ],
    reviewSignals: ["Pack template approved", "Attachment model defined", "Context-pack output reviewed"],
  },
  {
    id: "timeline-builder",
    title: "Timeline Builder",
    summary: "Synthesize a person's events and contextual reports into a research or story timeline.",
    purpose:
      "Expose chronological gaps and help families read a life as a sequence of sourced events.",
    visibility: "hidden",
    maturity: "concept",
    privacyRisk: "medium",
    requiredData: ["Person events", "Places", "Context reports", "Story workflow state"],
    relatedIssues: ["GEN-24"],
    launch: {
      state: "flagged",
      flag: "EXPERIMENT_TIMELINE_BUILDER",
    },
    privacyNotes: [
      "Timelines can accidentally imply unsupported relationships or living-person details.",
      "Public presentation needs publish-safety gates before launch.",
    ],
    reviewSignals: ["Research-vs-presentation purpose chosen", "Evidence gaps visible", "Public output gated"],
  },
  {
    id: "photo-analyzer",
    title: "Privacy-Preserving Photo Analyzer",
    summary: "Evaluate old photos for dating, context clues, and attachment metadata after consent review.",
    purpose:
      "Support memory interpretation without sending sensitive images or living-person details to AI by default.",
    visibility: "hidden",
    maturity: "concept",
    privacyRisk: "high",
    requiredData: ["Reviewed media", "Rights status", "AI-use permission", "Privacy review note"],
    relatedIssues: ["GEN-25"],
    launch: {
      state: "flagged",
      flag: "EXPERIMENT_PHOTO_ANALYZER",
    },
    privacyNotes: [
      "Faces, homes, locations, handwriting, and contributor metadata can be sensitive.",
      "AI analysis must require explicit media-level permission.",
    ],
    reviewSignals: ["Consent model approved", "AI-use gate enforced", "No unreviewed media submitted"],
  },
  {
    id: "family-review-workspace",
    title: "Family Review Workspace",
    summary: "Collect family comments on private drafts without surrendering owner editorial control.",
    purpose:
      "Explore collaboration models before adding shared-vault or account-based permissions.",
    visibility: "hidden",
    maturity: "concept",
    privacyRisk: "high",
    requiredData: ["Story drafts", "Reviewer identity model", "Owner-controlled permissions"],
    relatedIssues: ["GEN-28"],
    launch: {
      state: "flagged",
      flag: "EXPERIMENT_FAMILY_REVIEW",
    },
    privacyNotes: [
      "Private links and comments can leak living-person or sensitive relationship claims.",
      "Owner moderation and revocation need to exist before broad access.",
    ],
    reviewSignals: ["Permission model chosen", "Comment privacy policy reviewed", "Owner controls specified"],
  },
  {
    id: "ancestor-map-lab",
    title: "Ancestor Map Lab",
    summary: "Prototype pins, heatmaps, migration paths, and statistics from reviewed person/place data.",
    purpose:
      "Find the most useful visual view before committing to a full map product surface.",
    visibility: "hidden",
    maturity: "concept",
    privacyRisk: "medium",
    requiredData: ["Birth/death/burial/marriage places", "Event dates", "Lineage or family grouping"],
    relatedIssues: ["GEN-30"],
    launch: {
      state: "flagged",
      flag: "EXPERIMENT_ANCESTOR_MAPS",
    },
    privacyNotes: [
      "Map outputs can reveal current or recent-family locations when living people are included.",
      "Private vault data must not appear in public map previews.",
    ],
    reviewSignals: ["First map view chosen", "Living-person filter defined", "Place quality threshold set"],
  },
] satisfies ExperimentDefinition[];

export function isExperimentFlagEnabled(flag: string | undefined, env: NodeJS.ProcessEnv = process.env) {
  if (!flag) return true;
  return env[flag] === "1" || env[flag] === "true";
}

export function isExperimentVisible(
  experiment: ExperimentDefinition,
  env: NodeJS.ProcessEnv = process.env
) {
  if (experiment.visibility !== "hidden") return true;
  return isExperimentFlagEnabled(experiment.launch.flag, env);
}

export function isExperimentLaunchAvailable(
  experiment: ExperimentDefinition,
  env: NodeJS.ProcessEnv = process.env
) {
  if (experiment.launch.state === "planned") return false;
  return isExperimentFlagEnabled(experiment.launch.flag, env);
}

export function getVisibleExperiments(env: NodeJS.ProcessEnv = process.env) {
  return experimentDefinitions.filter((experiment) => isExperimentVisible(experiment, env));
}
