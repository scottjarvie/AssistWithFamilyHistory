import type { Metadata } from "next";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Legacy Source Documentation",
  description:
    "Legacy Source Documentation routes now redirect into the Research Vault imports and person workspace.",
  path: "/app/source-docs",
});

export default function SourceDocsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
