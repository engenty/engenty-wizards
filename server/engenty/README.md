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
- packages/connections-sdk/src/registry.ts → server/engenty/connections-sdk/registry.ts
- packages/connections-sdk/src/files-capability.ts → server/engenty/connections-sdk/files-capability.ts
- packages/connections-sdk/src/storage-capability.ts → server/engenty/connections-sdk/storage-capability.ts
- modules/connections/providers/external/src/types.ts → server/engenty/connections-external/types.ts
- modules/connections/providers/external/src/errors.ts → server/engenty/connections-external/errors.ts
- modules/connections/providers/external/src/registry-client.ts → server/engenty/connections-external/registry-client.ts
- modules/connections/providers/external/src/registry-source.ts → server/engenty/connections-external/registry-source.ts
- modules/connections/providers/external/src/import-service.ts → server/engenty/connections-external/import-service.ts
- modules/connections/providers/external/src/build-connector.ts → server/engenty/connections-external/build-connector.ts
- modules/connections/providers/external/src/oauth-dcr.ts → server/engenty/connections-external/oauth-dcr.ts
- modules/connections/providers/external/src/importer/classify.ts → server/engenty/connections-external/importer/classify.ts
- modules/connections/providers/external/src/importer/map-auth.ts → server/engenty/connections-external/importer/map-auth.ts
- modules/connections/providers/external/src/importer/normalize-mcp.ts → server/engenty/connections-external/importer/normalize-mcp.ts
- modules/connections/providers/external/src/importer/normalize-openapi.ts → server/engenty/connections-external/importer/normalize-openapi.ts
- modules/connections/providers/external/src/invoke/http-invoker.ts → server/engenty/connections-external/invoke/http-invoker.ts
- modules/connections/providers/external/src/invoke/mcp-client.ts → server/engenty/connections-external/invoke/mcp-client.ts
- modules/connections/providers/external/src/net/guarded-fetch.ts → server/engenty/connections-external/net/guarded-fetch.ts
- packages/web-ingest/src/lib/ssrf.ts → server/engenty/web-ingest/ssrf.ts
- modules/connections/providers/google/src/shared.ts → server/engenty/connections-google/shared.ts
- modules/connections/providers/google/src/definitions.ts → server/engenty/connections-google/definitions.ts
- modules/connections/providers/google/src/connectors/gmail.ts → server/engenty/connections-google/connectors/gmail.ts
- modules/connections/providers/google/src/connectors/drive.ts → server/engenty/connections-google/connectors/drive.ts
- modules/connections/providers/google/src/connectors/calendar.ts → server/engenty/connections-google/connectors/calendar.ts
- modules/connections/providers/google/src/connectors/contacts.ts → server/engenty/connections-google/connectors/contacts.ts
- modules/connections/providers/microsoft/src/graph.ts → server/engenty/connections-microsoft/graph.ts
- modules/connections/providers/microsoft/src/action.ts → server/engenty/connections-microsoft/action.ts
- modules/connections/providers/microsoft/src/outlook.ts → server/engenty/connections-microsoft/outlook.ts
- modules/connections/providers/microsoft/src/onedrive.ts → server/engenty/connections-microsoft/onedrive.ts
- modules/connections/providers/slack/src/connector.ts → server/engenty/connections-slack/connector.ts
- modules/connections/providers/github/src/connector.ts → server/engenty/connections-github/connector.ts
- modules/connections/providers/hubspot/src/connector.ts → server/engenty/connections-hubspot/connector.ts
- modules/connections/providers/s3/src/s3.ts → server/engenty/connections-s3/s3.ts
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
