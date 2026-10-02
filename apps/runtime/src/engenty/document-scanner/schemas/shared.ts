import { z } from "zod";

/**
 * Tax type enum — covers major international tax systems.
 * Modeled after midday's taxTypeSchema.
 */
export const taxTypeSchema = z.enum([
  "vat",
  "sales_tax",
  "gst",
  "withholding_tax",
  "service_tax",
  "excise_tax",
  "reverse_charge",
  "custom_tax",
]);

export type TaxType = z.infer<typeof taxTypeSchema>;

/** Document type classifier */
export const documentTypeSchema = z.enum(["invoice", "receipt", "other"]);

export type DocumentType = z.infer<typeof documentTypeSchema>;

const documentTypeDescription = `Classify this document type FIRST before extracting data:
- 'invoice': A bill requesting payment with amounts due, from vendor to customer
- 'receipt': Proof of completed purchase showing items and payment made
- 'other': Any non-financial document (contracts, agreements, newsletters, shipping notifications, confirmations without amounts, terms of service, correspondence)
If 'other', financial fields (amount, currency, etc.) may be left as null.`;

/** Shared line item schema */
export const lineItemSchema = z.object({
  description: z.string().nullable().describe("Description of the item"),
  quantity: z.number().nullable().describe("Quantity of items"),
  unit_price: z.number().nullable().describe("Price per unit"),
  total_price: z.number().nullable().describe("Total price for this line item"),
  tax_rate: z
    .number()
    .nullable()
    .optional()
    .describe("Tax rate percentage for this item (e.g., 20 for 20%)"),
  discount: z
    .number()
    .nullable()
    .optional()
    .describe("Discount amount applied to this item if any"),
});

export type LineItem = z.infer<typeof lineItemSchema>;

export { documentTypeDescription };
