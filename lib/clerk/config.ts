export function isClerkEnabled() {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();
  const secretKey = process.env.CLERK_SECRET_KEY?.trim();
  const disabled =
    process.env.NEXT_PUBLIC_DISABLE_CLERK === "true" ||
    process.env.DISABLE_CLERK === "true";
  const localDevDisabled =
    process.env.NODE_ENV === "development" &&
    process.env.NEXT_PUBLIC_ENABLE_CLERK_DEV !== "true" &&
    process.env.ENABLE_CLERK_DEV !== "true";

  const localPublic = process.env.NODE_ENV === "development" && !process.env.VERCEL && !process.env.CI && ["live", "sandbox"].includes(process.env.NEXT_PUBLIC_LOCAL_DEVELOPMENT_MODE ?? "");
  return Boolean(
    !disabled &&
      (!localDevDisabled || localPublic) &&
      publishableKey &&
      (secretKey || localPublic) &&
      publishableKey.startsWith("pk_") &&
      (secretKey?.startsWith("sk_") || localPublic)
  );
}

export function isAnonymousVaultEnabled() {
  return (
    process.env.NEXT_PUBLIC_ALLOW_ANONYMOUS_VAULT === "true" ||
    process.env.ALLOW_ANONYMOUS_VAULT === "true"
  );
}

export function getClerkPublishableKey() {
  return isClerkEnabled() ? process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY : undefined;
}
