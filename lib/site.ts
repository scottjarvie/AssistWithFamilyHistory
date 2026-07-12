const defaultSiteUrl = "http://127.0.0.1:3443";

export const SITE_NAME = "Discover Their Stories";
export const SITE_DESCRIPTION =
  "Use AI to discover family stories beyond names and dates by finding evidence, building context, and turning research into meaningful narratives.";

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || defaultSiteUrl)
  .trim()
  .replace(/\/+$/, "");
