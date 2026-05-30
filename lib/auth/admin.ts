/**
 * Admin / Operator role gate.
 *
 * Per the Shared Agent API Operating Model, Admin/Operator is a ROLE — not a
 * normal self-serve tier. It governs control-plane actions (key/user governance,
 * usage/abuse review, cross-user operations). Membership is an explicit
 * allowlist of Clerk user ids in the `ADMIN_USER_IDS` env var (comma-separated).
 * Default is "no admins", so the admin surface is closed until configured.
 */
export function adminUserIds(): string[] {
  return (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export function isAdminUser(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return adminUserIds().includes(userId);
}
