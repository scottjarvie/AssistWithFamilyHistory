import { readdirSync, statSync } from "fs";
import path from "path";
import { isProtectedAppPath } from "../lib/vault/protectedRoutes";

function walkRouteFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...walkRouteFiles(fullPath));
    } else if (entry === "route.ts") {
      files.push(fullPath);
    }
  }

  return files;
}

function toApiPath(filePath: string) {
  const relative = path.relative(path.join(process.cwd(), "app", "api"), filePath);
  const segments = relative.split(path.sep).slice(0, -1);
  return `/api/${segments.join("/")}`;
}

const expectedProtected = [
  "/app",
  "/app/people/new",
  "/app/operations",
  "/api/people",
  "/api/first-start",
  "/api/people/abc/context-pack",
  "/api/import",
  "/api/process",
  "/api/capabilities",
  "/api/convex/stats",
  "/api/operations/queue",
  "/api/operations/checks",
  "/api/queue",
  "/api/queue/abc",
  "/api/stories/abc",
  "/api/stories/abc/status",
  "/api/context-reports",
  "/api/context-items",
  "/api/media/review",
  "/api/ai-connections",
];

const expectedPublic = [
  "/",
  "/features",
  "/extension",
  "/updates",
  "/stories/abc",
  "/api/unknown",
];

const failures: string[] = [];

for (const routeFile of walkRouteFiles(path.join(process.cwd(), "app", "api"))) {
  const apiPath = toApiPath(routeFile);
  if (!isProtectedAppPath(apiPath)) {
    failures.push(`API route is not in the protected route set: ${apiPath}`);
  }
}

for (const route of expectedProtected) {
  if (!isProtectedAppPath(route)) {
    failures.push(`Expected protected: ${route}`);
  }
}

for (const route of expectedPublic) {
  if (isProtectedAppPath(route)) {
    failures.push(`Expected public: ${route}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Protected route assertions passed");
