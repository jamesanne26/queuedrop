import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright uses 127.0.0.1 for the local E2E server. Explicitly allowing it
  // avoids Next.js development cross-origin blocking for chunks/HMR.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
