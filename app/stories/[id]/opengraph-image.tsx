import { ImageResponse } from "next/og";
import { api } from "@/convex/_generated/api";
import { getConvexClient, isConvexConfigured } from "@/lib/convex/server";
import { buildPublicStorySharePreview, canRenderPublicStory } from "@/lib/stories/publicStoryPolicy";

export const runtime = "nodejs";
export const alt = "Published ancestor story";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default async function StoryOpenGraphImage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let preview = {
    title: "Story not available",
    description: "This story is not published.",
    eyebrow: "Private story",
  };

  if (isConvexConfigured()) {
    try {
      const bundle = await getConvexClient().query(api.vault.getPublishedStoryByIdentifier, {
        storyIdentifier: id,
      });
      if (bundle && canRenderPublicStory(bundle.story.status)) {
        preview = buildPublicStorySharePreview({
          story: bundle.story,
          person: bundle.person,
        });
      }
    } catch {
      preview = {
        title: "Story not available",
        description: "This story is not published.",
        eyebrow: "Private story",
      };
    }
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#f7f0e3",
          padding: "68px",
          color: "#1c1917",
          fontFamily: "Georgia, serif",
        }}
      >
        <div style={{ fontSize: 30, letterSpacing: 2, textTransform: "uppercase", color: "#8a4b21" }}>
          Published Ancestor Story
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 70, fontWeight: 700, lineHeight: 1.02, maxWidth: "88%" }}>
            {preview.title}
          </div>
          <div style={{ fontSize: 31, lineHeight: 1.35, maxWidth: "82%", color: "#57534e" }}>
            {preview.description}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 28, color: "#6b5d46" }}>
          <div>{preview.eyebrow}</div>
          <div>discovertheirstories.com</div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
