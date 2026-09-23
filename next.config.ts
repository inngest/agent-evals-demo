import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // The dev-mode badge sits over the booth's presenter HUD, and the booth is
  // often driven from `npm run dev`.
  devIndicators: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
};

export default nextConfig;
