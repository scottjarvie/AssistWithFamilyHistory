export function stringifyPersonIdentifier(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  if (
    value &&
    typeof value === "object" &&
    "toString" in value &&
    typeof value.toString === "function"
  ) {
    const rendered = value.toString().trim();
    return rendered.length > 0 && rendered !== "[object Object]" ? rendered : null;
  }

  return null;
}

export function getPersonRouteId(
  personFsId: string | null | undefined,
  fallbackIdentifier: unknown
) {
  return (
    (typeof personFsId === "string" && personFsId.trim().length > 0
      ? personFsId.trim()
      : null) || stringifyPersonIdentifier(fallbackIdentifier)
  );
}

export function matchesPersonIdentifier(
  personIdentifier: string,
  candidate: { fsId?: string | null; id?: unknown }
) {
  const fsId = typeof candidate.fsId === "string" ? candidate.fsId.trim() : "";
  const fallbackId = stringifyPersonIdentifier(candidate.id);

  return personIdentifier === fsId || personIdentifier === fallbackId;
}
