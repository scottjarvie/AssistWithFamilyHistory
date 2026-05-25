type SafeLogDetails = Record<string, string | number | boolean | null | undefined>;

const SECRET_LIKE = /(api[-_ ]?key|token|secret|password|cookie|authorization|prompt|evidence|raw|payload|genealogy)/i;

export function logServerFailure(
  event: string,
  details: SafeLogDetails = {},
  error?: unknown
) {
  const safeDetails = Object.fromEntries(
    Object.entries(details)
      .filter(([key, value]) => value !== undefined && !SECRET_LIKE.test(key))
      .map(([key, value]) => [key, typeof value === "string" ? value.slice(0, 160) : value])
  );

  const errorDetails =
    error instanceof Error
      ? {
          errorName: error.name,
          errorClass: error.constructor.name,
        }
      : undefined;

  console.error(
    JSON.stringify({
      level: "error",
      event,
      ...safeDetails,
      ...errorDetails,
      at: new Date().toISOString(),
    })
  );
}
