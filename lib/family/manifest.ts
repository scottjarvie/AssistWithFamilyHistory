import snapshot from "./manifest-2026-11-12.json";

export interface FamilySpace {
  slug: string;
  subject: string;
  color: string;
  status: "Live" | "Soft launch" | "In design";
  href?: string;
}

function safeHref(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password) return url.href;
  } catch { /* Missing/invalid destinations stay labels. */ }
}

/** Public Life manifest snapshot, retrieved 2026-11-12. No render-time fetch. */
export function validateFamilyManifest(value: unknown): { home: string; spaces: FamilySpace[] } | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const home = safeHref(data.home);
  if (data.version !== 1 || !home || !Array.isArray(data.spaces)) return null;
  const seen = new Set<string>();
  const spaces: FamilySpace[] = [];
  for (const item of data.spaces) {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    if (typeof row.slug !== "string" || !row.slug || seen.has(row.slug) ||
      typeof row.subject !== "string" || !row.subject ||
      typeof row.color !== "string" || !/^#[\da-f]{6}$/i.test(row.color) ||
      !["Live", "Soft launch", "In design"].includes(String(row.status))) return null;
    seen.add(row.slug);
    spaces.push({ slug: row.slug, subject: row.subject, color: row.color,
      status: row.status as FamilySpace["status"], href: safeHref(row.href) });
  }
  return { home, spaces };
}

const manifest = validateFamilyManifest(snapshot);
if (!manifest) throw new Error("Invalid dated Life family manifest");
const current = manifest.spaces.find((s) => s.slug === "family-history") ?? {
  slug: "family-history", subject: "Family History", color: "#2C6A4F", status: "Live" as const,
};
export const familySpaces = [current, ...manifest.spaces.filter((s) => s.slug !== current.slug)];
export const lifeDirectoryHref = `${manifest.home.replace(/\/$/, "")}#all-spaces`;
