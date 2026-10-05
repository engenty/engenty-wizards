import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type InferPageType, loader } from "fumadocs-core/source";
import { lucideIconsPlugin } from "fumadocs-core/source/lucide-icons";
import { docs } from "@/.source/server";
import { BASE_PATH } from "./site";

// The app is served below BASE_PATH, so a page's address inside the app starts at "/".
export const source = loader({
  baseUrl: "/",
  source: docs.toFumadocsSource(),
  plugins: [lucideIconsPlugin()],
});

export type Page = InferPageType<typeof source>;

// Must stay the `dir` of source.config.ts.
const contentRoot = join(process.cwd(), "..", "..", "docs", "content");

function stripFrontmatter(markdown: string) {
  return markdown.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, "");
}

/** A page as plain Markdown, for people who paste it into an AI client and for llms-full.txt. */
export async function getLLMText(page: Page) {
  const raw = await readFile(join(contentRoot, page.path), "utf8");
  return [
    `# ${page.data.title}`,
    page.data.description ?? null,
    `URL: ${BASE_PATH}${page.url}`,
    stripFrontmatter(raw).trim(),
  ]
    .filter((part): part is string => Boolean(part))
    .join("\n\n");
}
