import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { StepContext } from "../engine/types.js";
import { runPages, writeRunPage } from "../services/space-data.js";
import { attempt, clip } from "./shared.js";

/**
 * Pages of the space for a step that lists "pages": Markdown its wizard keeps for every run —
 * notes, a log, a summary that grows — and the space's own pages to read. They stand in the
 * studio under Space → Daten.
 */
export function pageTools(ctx: StepContext) {
  const projectId = ctx.project.id;
  const wizardId = ctx.store.wizardId;
  return {
    page_read: createTool({
      id: "page_read",
      description:
        "Read a page of the space: one this wizard wrote, or one of the space's own. Without a title it lists the pages there are.",
      inputSchema: z.object({ title: z.string().optional() }),
      execute: ({ title }) =>
        attempt(async () => {
          const pages = await runPages(projectId, wizardId);
          const of = (p: (typeof pages)[number]) => (p.wizardId ? "wizard" : "space");
          if (!title?.trim()) {
            return {
              pages: pages.map((p) => ({ title: p.title, of: of(p), chars: p.markdown.length })),
            };
          }
          const page = pages.find((p) => p.title.toLowerCase() === title.trim().toLowerCase());
          if (!page) {
            return {
              error: `No page "${title}".`,
              pages: pages.map((p) => p.title),
            };
          }
          return { title: page.title, of: of(page), markdown: clip(page.markdown, 40_000) };
        }),
    }),
    page_write: createTool({
      id: "page_write",
      description:
        "Write a page of this wizard in Markdown, kept for every later run and shown to the admin in the studio. A page with the same title is replaced — or added to with append: true (a log, a list that grows). The space's own pages are read-only.",
      inputSchema: z.object({
        title: z.string().min(1).max(200),
        markdown: z.string().max(200_000),
        append: z.boolean().optional(),
      }),
      execute: (input) =>
        attempt(async () => {
          const page = await writeRunPage(projectId, wizardId, input);
          await ctx.emit("tool", `Schreibt die Seite „${page.title}“`);
          return page;
        }),
    }),
  };
}
