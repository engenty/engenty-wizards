import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { StepContext } from "../engine/types.js";
import { runPages, writeRunPage } from "../services/space-data.js";
import { pageReadInput, readKnowledgePage } from "./project.js";
import { attempt, clip } from "./shared.js";

/**
 * Pages for a step that lists "pages": Markdown its wizard keeps for every run — notes, a log, a
 * summary that grows — shown in the studio under Space → Daten. Its page_read also reads the
 * pages of Wissen, by path.
 */
export function pageTools(ctx: StepContext) {
  const projectId = ctx.project.id;
  const wizardId = ctx.store.wizardId;
  return {
    page_read: createTool({
      id: "page_read",
      description:
        "Read a page: one this wizard wrote, by its title, or a page of Wissen, by its path (pages/…). Without either it lists the wizard's pages.",
      inputSchema: z.object({
        title: z.string().optional().describe("A page this wizard wrote"),
        path: pageReadInput.path.optional(),
        section: pageReadInput.section,
        from: pageReadInput.from,
      }),
      execute: ({ title, path, section, from }) => {
        if (path?.trim()) {
          return readKnowledgePage(ctx, { path, section, from });
        }
        return attempt(async () => {
          const pages = await runPages(projectId, wizardId);
          if (!title?.trim()) {
            return { pages: pages.map((p) => ({ title: p.title, chars: p.markdown.length })) };
          }
          const page = pages.find((p) => p.title.toLowerCase() === title.trim().toLowerCase());
          if (!page) {
            return { error: `No page "${title}".`, pages: pages.map((p) => p.title) };
          }
          return { title: page.title, markdown: clip(page.markdown, 40_000) };
        });
      },
    }),
    page_write: createTool({
      id: "page_write",
      description:
        "Write a page of this wizard in Markdown, kept for every later run and shown to the admin in the studio. A page with the same title is replaced — or added to with append: true (a log, a list that grows). Pages of Wissen are read-only.",
      inputSchema: z.object({
        title: z.string().min(1).max(200),
        markdown: z.string().max(200_000),
        append: z.boolean().optional(),
      }),
      execute: (input) =>
        attempt(async () => {
          const page = await writeRunPage(projectId, wizardId, input);
          await ctx.emit("tool", { code: "writesPage", params: { title: page.title } });
          return page;
        }),
    }),
  };
}
