import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Assist With Family History";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #fef3c7 0%, #fafaf9 50%, #e7e5e4 100%)",
          padding: "64px",
          color: "#292524",
          fontFamily: "Georgia, serif",
        }}
      >
        <div style={{ fontSize: 34, letterSpacing: 2, textTransform: "uppercase", color: "#92400e" }}>
          Family History AI
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 84, fontWeight: 700, lineHeight: 1.05 }}>
            <span>Assist With</span>
            <span>Family History</span>
          </div>
          <div style={{ fontSize: 34, maxWidth: "85%", color: "#44403c" }}>
            Research deeply, document evidence, and turn genealogy records into narratives.
          </div>
        </div>
        <div style={{ fontSize: 28, color: "#57534e" }}>assistwithfamilyhistory.com</div>
      </div>
    ),
    {
      ...size,
    }
  );
}
