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

  return Boolean(
    !disabled &&
      !localDevDisabled &&
      publishableKey &&
      secretKey &&
      publishableKey.startsWith("pk_") &&
      secretKey.startsWith("sk_")
  );
}

export function getClerkPublishableKey() {
  return isClerkEnabled() ? process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY : undefined;
}
