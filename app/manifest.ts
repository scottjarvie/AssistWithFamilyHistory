import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Assist With Family History",
    short_name: "Family History",
    description:
      "A private FamilySearch-first research vault, Queue and story workspace.",
    start_url: "/",
    display: "standalone",
    background_color: "#FAF8F1",
    theme_color: "#f7f3e8",
    icons: [
      { src: "/icons/app-icon-2026-11-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/app-icon-2026-11-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/app-icon-2026-11-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
