/** Ordinary footer surfaces only; task, account and record flows keep their focus. */
export function showAppFamilyRow(path: string, hash: string, signedIn: boolean) {
  if (!signedIn || /(settings|files|connection|activity|library|preferences|capture|upload|record)/i.test(hash)) return false;
  return ["/app", "/app/people", "/app/places", "/app/stories", "/app/writing", "/app/research", "/app/me", "/app/source-docs", "/app/timeline", "/app/tools", "/app/suggestions", "/app/archive"].includes(path);
}
