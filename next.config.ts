import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
    // @anchor-lang/core's browser build still has a require("fs") on a Node-only path.
    resolveAlias: {
      fs: { browser: "./lib/empty.js" },
    },
  },
};

export default nextConfig;
