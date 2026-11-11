const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // typescript: { ignoreBuildErrors: true }, // Enable in dev only
  // eslint: { ignoreDuringBuilds: true }, // Enable in dev only
  serverExternalPackages: ["pixi.js", "better-sqlite3"],
  outputFileTracingRoot: path.join(__dirname),
  compress: true,
};

module.exports = nextConfig;
