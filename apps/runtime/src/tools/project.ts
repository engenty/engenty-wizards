import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { StepContext } from "../engine/types.js";
import { documentText, searchProject } from "../services/project-index.js";
import { attempt, clip } from "./shared.js";

/** The project's documents, for every agent step of its wizards: search the index, read one whole. */
export function projectTools(ctx: StepContext): Record<string, any> {
  const docs = ctx.projectFiles.filter((f) => f.kind === "document");
  if (!docs.length) {
    return {};
  }
  return {
    project_search: createTool({
      id: "project_search",
      description:
        "Search the project's documents (the knowledge its owner gave for all wizards) and get the passages that fit best. Ask in the documents' language, with the words they would use.",
      inputSchema: z.object({
        query: z.string().describe("What to look for: a question or keywords"),
        limit: z.number().int().min(1).max(12).optional(),
      }),
      execute: ({ query, limit }) =>
        attempt(async () => {
          await ctx.emit("tool", `Sucht in den Dokumenten: ${query.slice(0, 60)}`);
          const hits = await searchProject(ctx.project.id, query, limit ?? 6);
          return {
            passages: hits.map((h) => ({ document: h.name, part: h.index, text: h.text })),
          };
        }),
    }),
    project_document: createTool({
      id: "project_document",
      description:
        "Read one of the project's documents as text. Long documents come in parts: pass `from` to continue.",
      inputSchema: z.object({
        name: z.string().describe("The document's name, as listed"),
        from: z.number().int().min(0).optional().describe("Character to start at"),
      }),
      execute: ({ name, from }) =>
        attempt(async () => {
          const doc =
            docs.find((d) => d.name === name) ??
            docs.find((d) => d.name.toLowerCase().includes(name.toLowerCase()));
          if (!doc) {
            throw new Error(
              `No document "${name}". There are: ${docs.map((d) => d.name).join(", ")}`,
            );
          }
          await ctx.emit("tool", `Liest ${doc.name}`);
          const text = await documentText(doc);
          const start = Math.min(from ?? 0, text.length);
          const part = text.slice(start, start + 12_000);
          return {
            document: doc.name,
            text: clip(part, 12_000),
            next: start + part.length < text.length ? start + part.length : null,
            length: text.length,
          };
        }),
    }),
  };
}
