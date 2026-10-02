import { type Format, formatsFor, type Step } from "../shared/definition.js";
import type { StepOutput } from "../shared/run.js";
import {
  firstTable,
  htmlToDocx,
  htmlToMarkdown,
  htmlToPdf,
  htmlToPng,
  jsonToMarkdown,
  MIME,
  markdownToHtml,
  tableToCsv,
  tableToXlsx,
} from "./render/convert.js";
import { extFor, inlineAssetRefs, loadAsset, loadAssetText } from "./storage.js";

export interface Download {
  data: Uint8Array | string;
  mime: string;
  filename: string;
}

export function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "result"
  );
}

/** One step's output in one format. Conversions happen on demand. */
export async function renderDownload(
  step: Step,
  output: StepOutput,
  format: Format,
  baseName: string,
  ownerId: string,
): Promise<Download | null> {
  if (!formatsFor(step).includes(format)) {
    return null;
  }
  const name = slug(baseName);
  const file = (ext: string) => `${name}.${ext}`;

  if (step.type === "generate") {
    const asset = output.assets?.[0];
    if (!asset) {
      return null;
    }
    if (step.asset === "image" || step.asset === "video") {
      const found = await loadAsset(asset.id);
      return found
        ? {
            data: new Uint8Array(found.data),
            mime: found.row.mime,
            filename: file(extFor(found.row.mime)),
          }
        : null;
    }
    const html = await inlineAssetRefs(await loadAssetText(asset.id), ownerId);
    switch (format) {
      case "html":
        return { data: html, mime: MIME.html, filename: file("html") };
      case "pdf":
        return { data: await htmlToPdf(html), mime: MIME.pdf, filename: file("pdf") };
      case "png":
        return { data: await htmlToPng(html), mime: MIME.png, filename: file("png") };
      case "docx":
        return { data: await htmlToDocx(html), mime: MIME.docx, filename: file("docx") };
      case "md":
        return { data: htmlToMarkdown(html), mime: MIME.md, filename: file("md") };
      default:
        return null;
    }
  }

  if (step.type === "agent") {
    const text = output.text ?? "";
    if (step.output.format === "json") {
      const rows = firstTable(output.json);
      switch (format) {
        case "json":
          return {
            data: JSON.stringify(output.json, null, 2),
            mime: MIME.json,
            filename: file("json"),
          };
        case "csv":
          return rows ? { data: tableToCsv(rows), mime: MIME.csv, filename: file("csv") } : null;
        case "xlsx":
          return rows
            ? { data: await tableToXlsx(rows), mime: MIME.xlsx, filename: file("xlsx") }
            : null;
        case "md":
          return { data: jsonAsMarkdown(output.json), mime: MIME.md, filename: file("md") };
        default:
          return null;
      }
    }
    switch (format) {
      case "md":
        return { data: text, mime: MIME.md, filename: file("md") };
      case "txt":
        return { data: text, mime: MIME.txt, filename: file("txt") };
      case "html":
        return { data: markdownToHtml(text, baseName), mime: MIME.html, filename: file("html") };
      case "pdf":
        return {
          data: await htmlToPdf(markdownToHtml(text, baseName)),
          mime: MIME.pdf,
          filename: file("pdf"),
        };
      case "docx":
        return {
          data: await htmlToDocx(markdownToHtml(text, baseName)),
          mime: MIME.docx,
          filename: file("docx"),
        };
      default:
        return null;
    }
  }
  return null;
}

/** A structured result as readable Markdown: text fields as paragraphs, tables as tables. */
export function jsonAsMarkdown(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return jsonToMarkdown(value);
  }
  return Object.entries(value as Record<string, unknown>)
    .map(([key, v]) => {
      const heading = `### ${key}`;
      if (typeof v === "string" || typeof v === "number") {
        return `${heading}\n${v}`;
      }
      if (Array.isArray(v) && v.every((x) => typeof x !== "object")) {
        return `${heading}\n${v.map((x) => `- ${x}`).join("\n")}`;
      }
      return `${heading}\n${jsonToMarkdown(v)}`;
    })
    .join("\n\n");
}
