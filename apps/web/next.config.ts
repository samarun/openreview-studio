import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const apiOrigin = (process.env.API_URL ?? "http://localhost:4000").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  transpilePackages: ["@openreview/shared", "@openreview/ui"],
  outputFileTracingRoot: path.join(rootDir, "../.."),
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
        ignored: ["**/node_modules/**", "**/.git/**", "**/.next/**", "**/dist/**"]
      };
    }

    return config;
  },
  async rewrites() {
    return [
      {
        source: "/media/:path*",
        destination: `${apiOrigin}/media/:path*`
      }
    ];
  }
};

export default nextConfig;
