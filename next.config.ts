import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.NODE_ENV === "development" && ["live","sandbox"].includes(process.env.LOCAL_DEVELOPMENT_MODE ?? "") ? {distDir:`.next-local-${process.env.LOCAL_DEVELOPMENT_MODE}`,allowedDevOrigins:[process.env.LOCAL_DEVELOPMENT_MODE==="live"?"local.assistwithfamilyhistory.com":"family-history.localhost"]}:{}),
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
