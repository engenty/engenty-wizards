import { z } from "zod";
import { documentTypeSchema } from "./shared.js";

/**
 * Document classifier schema — lightweight extraction for routing.
 * Determines document type + metadata before full extraction.
 */
export const classifierSchema = z.object({
  document_type: documentTypeSchema.describe(
    "Classify this document: 'invoice' (bill requesting payment), 'receipt' (proof of payment), or 'other' (non-financial)."
  ),
  title: z
    .string()
    .nullable()
    .describe(
      "A descriptive, meaningful title for this document. Include key identifying information like document number, company names, dates. Examples: 'Invoice INV-2024-001 from Acme Corp', 'Receipt from Starbucks 2024-03-15'. Do NOT use generic names."
    ),
  summary: z
    .string()
    .nullable()
    .describe(
      "A brief, one-sentence summary of the document's main purpose or content."
    ),
  tags: z
    .array(z.string())
    .max(5)
    .nullable()
    .describe(
      "Up to 5 relevant keywords for classifying and searching (e.g., 'Invoice', 'Acme Corp', 'Consulting')."
    ),
  date: z
    .string()
    .nullable()
    .describe(
      "The most relevant date in ISO 8601 format (YYYY-MM-DD) — issue date, purchase date, etc."
    ),
  language: z
    .string()
    .nullable()
    .describe(
      "The language of the document (e.g., 'english', 'german', 'french')"
    ),
});

export type DocumentClassification = z.infer<typeof classifierSchema>;
