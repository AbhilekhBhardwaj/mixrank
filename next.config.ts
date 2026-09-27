import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root: a stray package-lock.json in the parent directory
  // otherwise makes Next infer the home directory as the project root.
  turbopack: {
    root: path.resolve(process.cwd()),
  },
};

export default nextConfig;
