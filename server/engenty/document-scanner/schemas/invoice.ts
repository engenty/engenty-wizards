import { z } from "zod";
import {
  documentTypeDescription,
  documentTypeSchema,
  lineItemSchema,
  taxTypeSchema,
} from "./shared.js";

/**
 * Incoming invoice extraction schema.
 * Uses Zod `.describe()` annotations as LLM instructions.
 * Designed for multi-modal OCR extraction via Mistral/Gemini.
 */
export const invoiceSchema = z.object({
  document_type: documentTypeSchema.describe(documentTypeDescription),

  invoice_number: z
    .string()
    .nullable()
    .describe("Unique identifier for the invoice (e.g., RE-2024-001)"),
  invoice_date: z
    .string()
    .nullable()
    .describe("Date of invoice in ISO 8601 format (YYYY-MM-DD)"),
  due_date: z
    .string()
    .nullable()
    .describe("Payment due date in ISO 8601 format (YYYY-MM-DD)"),

  total_amount: z
    .number()
    .nullable()
    .describe(
      "Total amount for the invoice in EUR. Null if document_type is 'other'."
    ),
  subtotal_amount: z.number().nullable().describe("Subtotal amount before tax"),
  tax_amount: z.number().nullable().describe("Tax amount for the invoice"),
  tax_rate: z
    .number()
    .nullable()
    .optional()
    .describe("Tax rate as a percentage value (e.g., 20 for 20%)"),
  tax_type: taxTypeSchema
    .nullable()
    .describe(
      "The type of tax applied: VAT, Sales Tax, GST, etc. Infer from country/context if not specified."
    ),

  vendor_name: z
    .string()
    .nullable()
    .describe(
      "The legal registered business name of the company issuing the invoice. Look for names with entity types like 'Inc.', 'Ltd', 'GmbH', 'e.U.', etc. Prioritize the name issuing the invoice, not subsidiaries."
    ),
  vendor_address: z
    .string()
    .nullable()
    .describe("Complete address of the vendor"),
  vendor_email: z.string().nullable().describe("Email of the vendor/seller"),
  vendor_website: z
    .string()
    .nullable()
    .describe(
      "Root domain of the vendor (e.g., 'example.com'). Infer from email if not explicit."
    ),
  vendor_vat_id: z
    .string()
    .nullable()
    .describe(
      "VAT ID of the vendor (e.g., ATU12345678, DE123456789). Look for UID, USt-IdNr., or similar."
    ),

  customer_name: z
    .string()
    .nullable()
    .describe("Name of the customer/buyer (the recipient of this invoice)"),
  customer_address: z
    .string()
    .nullable()
    .describe("Complete address of the customer"),

  line_items: z
    .array(lineItemSchema)
    .describe("Array of items/services listed in the invoice"),

  payment_instructions: z
    .string()
    .nullable()
    .describe("Payment terms, bank details, or instructions (IBAN, BIC, etc.)"),
  notes: z.string().nullable().describe("Additional notes or comments"),

  language: z
    .string()
    .nullable()
    .describe(
      "The language of the document (e.g., 'english', 'german', 'french')"
    ),
});

export type InvoiceExtraction = z.infer<typeof invoiceSchema>;
