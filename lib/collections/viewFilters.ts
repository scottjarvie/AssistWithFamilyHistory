/** Stable facet comparison and URL application; only the current collection's declared keys may change. */
export function canonicalFilters(filters: Record<string, string>) {
  return Object.fromEntries(Object.entries(filters).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, value || ""]));
}

export function applyCollectionFilters(href: string, current: Record<string, string>, saved: Record<string, string>) {
  const url = new URL(href);
  for (const key of Object.keys(current)) {
    const value = saved[key] || "";
    if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
  }
  url.searchParams.delete("page");
  return url.toString();
}
