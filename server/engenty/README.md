# engenty framework code

Files under `server/engenty` and `shared/engenty` are copies from the engenty monorepo
(commit `e5719c500`). They are not edited here: change them upstream, then run
`node scripts/sync-engenty.mjs`. Only `shims/` is written for this product — it stands in for
the engenty packages the copies import.

- packages/ai-core/src/data-tables/columns.ts → shared/engenty/data-tables/columns.ts
- packages/ai-core/src/data-tables/columns-value.ts → shared/engenty/data-tables/columns-value.ts
- packages/ai-core/src/data-tables/columns-format.ts → shared/engenty/data-tables/columns-format.ts
- packages/ai-core/src/data-tables/index.ts → shared/engenty/data-tables/index.ts
- packages/connections-sdk/src/types.ts → server/engenty/connections-sdk/types.ts
- packages/connections-sdk/src/oauth2.ts → server/engenty/connections-sdk/oauth2.ts
- modules/connections/providers/google/src/shared.ts → server/engenty/connections-google/shared.ts
- modules/connections/providers/microsoft/src/graph.ts → server/engenty/connections-microsoft/graph.ts
- packages/doc-converter/src/interface.ts → server/engenty/doc-converter/interface.ts
- packages/doc-converter/src/page-break.ts → server/engenty/doc-converter/page-break.ts
- packages/doc-converter/src/providers/local/index.ts → server/engenty/doc-converter/providers/local/index.ts
- packages/document-scanner/src/schemas/classifier.ts → server/engenty/document-scanner/schemas/classifier.ts
- packages/document-scanner/src/schemas/invoice.ts → server/engenty/document-scanner/schemas/invoice.ts
- packages/document-scanner/src/schemas/receipt.ts → server/engenty/document-scanner/schemas/receipt.ts
- packages/document-scanner/src/schemas/shared.ts → server/engenty/document-scanner/schemas/shared.ts
- packages/document-scanner/src/schemas/index.ts → server/engenty/document-scanner/schemas/index.ts
- packages/csv-import/src/parse-csv.ts → server/engenty/csv-import/parse-csv.ts
- packages/csv-import/src/xlsx-workbook.ts → server/engenty/csv-import/xlsx-workbook.ts
- packages/csv-import/src/csv-matrix.ts → server/engenty/csv-import/csv-matrix.ts
- packages/csv-import/src/serialize-csv.ts → server/engenty/csv-import/serialize-csv.ts
- packages/csv-import/src/types.ts → server/engenty/csv-import/types.ts
- packages/csv-import/src/import-sources.ts → server/engenty/csv-import/import-sources.ts
