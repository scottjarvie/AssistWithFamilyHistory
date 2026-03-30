import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

const publicRoutes = [
  "/",
  "/about",
  "/contact",
  "/extension",
  "/features",
  "/features/source-docs",
  "/privacy",
  "/roadmap",
  "/app",
  "/app/people",
  "/app/places",
  "/app/imports",
  "/app/research",
  "/app/story-writer",
  "/app/settings",
  "/app/source-docs",
  "/app/tools",
];

export default function sitemap(): MetadataRoute.Sitemap {
  return publicRoutes.map((route) => ({
    url: `${SITE_URL}${route}`,
    lastModified: new Date(),
    changeFrequency: route === "/" ? "weekly" : "monthly",
    priority: route === "/" ? 1 : 0.7,
  }));
}
