import {
  experimentDefinitions,
  getVisibleExperiments,
  isExperimentLaunchAvailable,
  type ExperimentDefinition,
} from "../lib/experiments/registry";

const allowedVisibility = new Set(["hidden", "beta", "public"]);
const allowedMaturity = new Set(["concept", "prototype", "pilot"]);
const allowedPrivacyRisk = new Set(["low", "medium", "high"]);
const allowedLaunchState = new Set(["available", "flagged", "planned"]);

const failures: string[] = [];
const ids = new Set<string>();

function requireNonEmpty(value: string | string[] | undefined, label: string, experiment: ExperimentDefinition) {
  if (Array.isArray(value) ? value.length === 0 : !value?.trim()) {
    failures.push(`${experiment.id}: missing ${label}`);
  }
}

for (const experiment of experimentDefinitions) {
  if (ids.has(experiment.id)) {
    failures.push(`${experiment.id}: duplicate experiment id`);
  }
  ids.add(experiment.id);

  requireNonEmpty(experiment.title, "title", experiment);
  requireNonEmpty(experiment.summary, "summary", experiment);
  requireNonEmpty(experiment.purpose, "purpose", experiment);
  requireNonEmpty(experiment.requiredData, "required data", experiment);
  requireNonEmpty(experiment.relatedIssues, "related Linear issues", experiment);
  requireNonEmpty(experiment.privacyNotes, "privacy notes", experiment);
  requireNonEmpty(experiment.reviewSignals, "review signals", experiment);

  if (!allowedVisibility.has(experiment.visibility)) {
    failures.push(`${experiment.id}: invalid visibility ${experiment.visibility}`);
  }
  if (!allowedMaturity.has(experiment.maturity)) {
    failures.push(`${experiment.id}: invalid maturity ${experiment.maturity}`);
  }
  if (!allowedPrivacyRisk.has(experiment.privacyRisk)) {
    failures.push(`${experiment.id}: invalid privacy risk ${experiment.privacyRisk}`);
  }
  if (!allowedLaunchState.has(experiment.launch.state)) {
    failures.push(`${experiment.id}: invalid launch state ${experiment.launch.state}`);
  }

  for (const issue of experiment.relatedIssues) {
    if (!/^GEN-\d+$/.test(issue)) {
      failures.push(`${experiment.id}: related issue must use GEN-123 format: ${issue}`);
    }
  }

  if (experiment.launch.href && !experiment.launch.href.startsWith("/app/")) {
    failures.push(`${experiment.id}: launch href must stay inside protected app routes`);
  }

  if (experiment.visibility === "hidden" && !experiment.launch.flag) {
    failures.push(`${experiment.id}: hidden experiments need a feature flag name`);
  }

  if (experiment.privacyRisk !== "low" && experiment.privacyNotes.length < 2) {
    failures.push(`${experiment.id}: medium/high privacy experiments need at least two privacy notes`);
  }
}

if (getVisibleExperiments().length === 0) {
  failures.push("At least one experiment must be visible by default");
}

if (!experimentDefinitions.some((experiment) => isExperimentLaunchAvailable(experiment))) {
  failures.push("At least one experiment must link to an available protected route");
}

if (!experimentDefinitions.some((experiment) => experiment.visibility === "hidden")) {
  failures.push("Registry must include at least one hidden experiment to prove the visibility model");
}

if (!experimentDefinitions.some((experiment) => experiment.privacyRisk === "high")) {
  failures.push("Registry must include a high-privacy-risk experiment to prove warning coverage");
}

if (failures.length > 0) {
  console.error("Experimental tools contract failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Experimental tools contract checks passed.");
