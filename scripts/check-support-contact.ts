/**
 * Support-contact contract.
 *
 * No Assist With site runs a mailbox or an email server. All support,
 * feedback, and privacy questions for the whole Assist With family go to the
 * one central support desk at https://assistwithlife.com/support.
 *
 * This guard keeps the public site honest in two directions:
 *   1. No public surface may publish a `mailto:` contact link or an
 *      Assist-With contact address (support@, contact@, privacy@, features@,
 *      hello@ …). Offering an address we cannot receive is a broken promise.
 *   2. The `/contact` page, the `/privacy` policy, and the machine-readable
 *      `/llms.txt` and `/ai.txt` guides must each still point at the support
 *      desk, so removing the email never leaves a dead end behind.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOTS = ["app", "components", "features", "lib"];
const ALLOWLIST = new Set<string>([
  // This file names the forbidden patterns in order to forbid them.
  "lib/site/supportDesk.ts",
]);

const SUPPORT_DESK_URL = "https://assistwithlife.com/support";
const CONTACT_MAILBOX = /\b(support|contact|privacy|features|feedback|hello|info|help|admin)@[a-z0-9.-]+\.[a-z]{2,}/i;
const MAILTO = /mailto:/i;

const failures: string[] = [];

function walk(dir: string): string[] {
  const out: string[] = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name === "_generated") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && /\.(tsx?|jsx?|mdx?|txt)$/.test(entry.name)) out.push(full);
  }
  return out;
}

for (const root of ROOTS) {
  for (const file of walk(root)) {
    const rel = path.relative(process.cwd(), file);
    if (ALLOWLIST.has(rel)) continue;
    const source = readFileSync(file, "utf8");
    source.split("\n").forEach((line, index) => {
      if (MAILTO.test(line)) {
        failures.push(
          `${rel}:${index + 1} publishes a mailto: link. Assist With sites have no mailbox — link ${SUPPORT_DESK_URL} instead.`
        );
      }
      if (CONTACT_MAILBOX.test(line)) {
        failures.push(
          `${rel}:${index + 1} publishes a contact email address. Assist With sites have no mailbox — link ${SUPPORT_DESK_URL} instead.`
        );
      }
    });
  }
}

const mustPointAtDesk = [
  "app/contact/page.tsx",
  "app/privacy/page.tsx",
  "app/llms.txt/route.ts",
  "app/ai.txt/route.ts",
];

for (const rel of mustPointAtDesk) {
  const source = readFileSync(rel, "utf8");
  const pointsAtDesk = source.includes(SUPPORT_DESK_URL) || source.includes("SUPPORT_DESK_URL");
  if (!pointsAtDesk) {
    failures.push(`${rel} must direct people to ${SUPPORT_DESK_URL}.`);
  }
}

if (failures.length > 0) {
  console.error("Support-contact contract failed:\n");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`Support-contact contract passed. All support routes to ${SUPPORT_DESK_URL}.`);
