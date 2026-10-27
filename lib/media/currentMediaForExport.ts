/** Reviewing current bytes does not approve earlier private originals for AI/export. */
export function currentMediaForExport<T extends { replacedB2Files?: unknown }>(media: T): Omit<T, "replacedB2Files"> {
  const current = { ...media };
  delete current.replacedB2Files;
  return current;
}
