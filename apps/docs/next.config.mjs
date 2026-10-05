import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // Everything of the site is below /docs — pages, files, search — so a proxy can send that one
  // path here and the rest of the host elsewhere. lib/site.ts names the same path.
  basePath: "/docs",
  /** Mermaid is large ESM; transpilation avoids subtle Turbopack/webpack issues. */
  transpilePackages: ["mermaid"],
  async redirects() {
    return [{ source: "/", destination: "/docs", basePath: false, permanent: false }];
  },
  async rewrites() {
    // A page's address with .mdx gives its Markdown (app/llms.mdx).
    return [{ source: "/:path*.mdx", destination: "/llms.mdx/:path*" }];
  },
};

export default withMDX(config);
