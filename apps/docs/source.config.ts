import { remarkMdxMermaid } from "fumadocs-core/mdx-plugins";
import { defineConfig, defineDocs } from "fumadocs-mdx/config";

// The pages live in docs/content at the repo root, as in the engenty repo.
export const docs = defineDocs({
  dir: "../../docs/content",
});

export default defineConfig({
  mdxOptions: {
    // Run before GFM/heading so ```mermaid fences become <Mermaid /> reliably.
    remarkPlugins: (preset) => [remarkMdxMermaid, ...preset],
  },
});
