import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // cacheComponents is intentionally OFF: every page in this app is per-user and
  // session-dependent, so there is no static shell to win, and keeping pages fully
  // dynamic lets auth redirects happen server-side before any HTML is streamed.
  images: {
    remotePatterns: [{ protocol: "https", hostname: "lh3.googleusercontent.com" }],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
