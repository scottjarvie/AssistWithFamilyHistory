const STATE_PATHS = [
  /^docs\/tracker\/cards\/AWF-\d{4}\.md$/,
  /^docs\/tracker\/work-orders\/AWF-WO-\d{3}\.md$/,
  /^docs\/tracker\/GUIDE\.md$/,
  /^docs\/tracker\/(?:board|guide)\.html$/,
  /^docs\/tracker\/tracker\.json$/,
  /^docs\/planning\/assist-with-family-history-project-philosophy\.(?:md|html)$/,
];

export const STATE_COMMIT_TRAILER = "skip-checks: true";

export function parseNameStatus(output) {
  if (!output.trim()) return [];
  return output
    .trim()
    .split("\n")
    .map((line) => {
      const fields = line.split("\t");
      if (fields.length !== 2) {
        return { status: "?", path: line, raw: line };
      }
      return { status: fields[0], path: fields[1], raw: line };
    });
}

export function rejectedStateChanges(changes) {
  return changes.filter(({ status, path }) => {
    if (!["A", "D", "M"].includes(status)) return true;
    return !STATE_PATHS.some((pattern) => pattern.test(path));
  });
}

export function hasStateCommitTrailer(message) {
  const finalLine = message.trimEnd().split("\n").at(-1)?.trim();
  return finalLine === STATE_COMMIT_TRAILER;
}
