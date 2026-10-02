import { z } from "zod";
import {
  documentTypeDescription,
  documentTypeSchema,
  lineItemSchema,
  taxTypeSchema,
} from "./shared.js";

/**
 * Receipt extraction schema.
 * Uses Zod `.describe()` annotations as LLM instructions (midday pattern).
 * Designed for multi-modal OCR extraction via Mistral/Gemini.
 */
export const receiptSchema = z.object({
  document_type: documentTypeSchema.describe(documentTypeDescription),

  date: z
    .string()
    .nullable()
    .describe("Date of receipt in ISO 8601 format (YYYY-MM-DD)"),

  total_amount: z
    .number()
    .nullable()
    .describe(
      "Total amount including tax in EUR. Null if document_type is 'other'."
    ),
  subtotal_amount: z.number().nullable().describe("Subtotal amount before tax"),
  tax_amount: z
    .number()
    .nullable()
    .describe("Tax amount. Null if document_type is 'other'."),
  tax_rate: z
    .number()
    .nullable()
    .optional()
    .describe("Tax rate as a percentage value (e.g., 20 for 20%)"),
  tax_type: taxTypeSchema
    .nullable()
    .describe(
      "The type of tax applied: VAT, Sales Tax, GST, Withholding Tax, Service Tax, Excise Tax, Reverse Charge, or Custom Tax. Infer from country/context if not specified."
    ),

  vendor_name: z
    .string()
    .nullable()
    .describe("Name of the store/merchant/vendor"),
  vendor_address: z
    .string()
    .nullable()
    .describe("Complete address of the vendor"),
  vendor_website: z
    .string()
    .nullable()
    .describe(
      "Vendor website URL — look directly on the receipt, or infer from email/store name."
    ),
  vendor_email: z
    .string()
    .nullable()
    .describe("Email of the vendor/store if present"),
  vendor_vat_id: z
    .string()
    .nullable()
    .describe(
      "VAT ID of the vendor (e.g., ATU12345678, DE123456789). Look for UID, USt-IdNr., or similar."
    ),

  payment_method: z
    .string()
    .nullable()
    .describe("Method of payment (e.g., cash, credit card, debit card)"),

  items: z
    .array(lineItemSchema)
    .describe("Array of items purchased on the receipt"),

  notes: z.string().nullable().describe("Additional notes or comments"),

  language: z
    .string()
    .nullable()
    .describe(
      "The language of the document (e.g., 'english', 'german', 'french')"
    ),
});

export type ReceiptExtraction = z.infer<typeof receiptSchema>;
