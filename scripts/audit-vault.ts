#!/usr/bin/env tsx
import fs from "fs";
import path from "path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { DEFAULT_LOCAL_VAULT_OWNER } from "../lib/vault/constants";

function loadConvexUrl() {
  if (process.env.NEXT_PUBLIC_CONVEX_URL) return process.env.NEXT_PUBLIC_CONVEX_URL;

  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return "";

  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const match = line.match(/^NEXT_PUBLIC_CONVEX_URL=["']?(.+?)["']?$/);
    if (match) return match[1];
  }

  return "";
}

async function main() {
  const convexUrl = loadConvexUrl();
  if (!convexUrl) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is required");
  }

  const vaultOwnerId = process.env.VAULT_OWNER_ID || DEFAULT_LOCAL_VAULT_OWNER;
  const authToken = process.env.CONVEX_AUTH_TOKEN;
  if (!authToken) {
    throw new Error(
      "CONVEX_AUTH_TOKEN is required for this private vault audit; use a short-lived Clerk convex-template JWT",
    );
  }
  const client = new ConvexHttpClient(convexUrl);
  client.setAuth(authToken);
  const audit = await client.action(api.vaultReads.getVaultAudit, { vaultOwnerId });

  console.log("Vault Audit");
  console.log("===========");
  console.log(`Vault owner: ${vaultOwnerId}`);
  console.log("");
  console.table(audit.counts);
  console.log("");
  console.log("Major gaps");
  console.table(audit.gaps);
  console.log("");
  console.log("Story workflow");
  console.table(audit.storyWorkflowCounts);
  console.log("");
  console.log("Priority people");
  console.table(
    audit.priorityPeople.map((person) => ({
      name: person.displayName,
      workflow: person.storyWorkflow,
      ready: `${person.completionPercent}%`,
      sources: person.sourceCount,
      context: person.contextReportCount,
      stories: person.storyCount,
    }))
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
