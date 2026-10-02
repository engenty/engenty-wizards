/** Stand-in for `@engenty/web-ingest`: its host guard, and this product's HTML to Markdown. */
export { htmlToMarkdown } from "../../render/convert.js";
export { assertPublicHttpHost, isBlockedIp, type LookupFn } from "../web-ingest/ssrf.js";
