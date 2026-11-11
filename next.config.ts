import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["pixi.js", "better-sqlite3"],
  outputFileTracingRoot: path.join(__dirname),
  compress: true,
};

export default nextConfig;
