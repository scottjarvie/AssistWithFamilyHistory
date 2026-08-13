import type { Metadata } from "next";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

interface CreatePageMetadataOptions {
  title: string;
  description: string;
  path: string;
}

function normalizeDescription(description: string): string {
  const trimmed = description.trim().replace(/\s+/g, " ");

  if (trimmed.length > 160) {
    return `${trimmed.slice(0, 157).trimEnd()}...`;
  }

  if (trimmed.length >= 120) {
    return trimmed;
  }

  const separator = trimmed.endsWith(".") ? " " : ". ";
  const expanded = `${trimmed}${separator}Keep evidence, context, uncertainty, and stories connected.`;

  if (expanded.length > 160) {
    return `${expanded.slice(0, 157).trimEnd()}...`;
  }

  if (expanded.length >= 120) {
    return expanded;
  }

  const fallback = `${expanded} Built for practical family history workflows.`;
  return fallback.length > 160
    ? `${fallback.slice(0, 157).trimEnd()}...`
    : fallback;
}

function normalizeTitle(title: string): string {
  const baseTitle = `${title} | ${SITE_NAME}`;
  const withQualifier =
    baseTitle.length < 30 ? `${baseTitle} | Family history workspace` : baseTitle;

  if (withQualifier.length <= 60) {
    return withQualifier;
  }

  return baseTitle.length <= 60 ? baseTitle : `${title} | ${SITE_NAME.slice(0, 40)}`;
}

export function createPageMetadata({
  title,
  description,
  path,
}: CreatePageMetadataOptions): Metadata {
  const canonicalPath = path.startsWith("/") ? path : `/${path}`;
  const seoTitle = normalizeTitle(title);
  const seoDescription = normalizeDescription(description);

  return {
    title: { absolute: seoTitle },
    description: seoDescription,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      title: seoTitle,
      description: seoDescription,
      type: "website",
      url: canonicalPath,
      siteName: SITE_NAME,
      images: ["/opengraph-image"],
    },
    twitter: {
      card: "summary_large_image",
      title: seoTitle,
      description: seoDescription,
      images: ["/opengraph-image"],
    },
  };
}

export const defaultMetadata: Metadata = {
  title: {
    default: normalizeTitle(SITE_NAME),
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    title: `${SITE_NAME} | Research-to-story workspace`,
    description: SITE_DESCRIPTION,
    type: "website",
    siteName: SITE_NAME,
    images: ["/opengraph-image"],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: ["/opengraph-image"],
  },
};
