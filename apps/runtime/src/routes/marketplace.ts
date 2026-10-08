import {
  CAPABILITY_IDS,
  INDUSTRY_IDS,
  ITEM_FORMAT_IDS,
  MARKETPLACE_PLAN_IDS,
  USE_CASE_IDS,
} from "@engenty-wizards/shared/marketplace";
import { Hono } from "hono";
import { z } from "zod";
import type { SessionUser } from "../auth/index.js";
import {
  asLang,
  marketplaceDetail,
  searchMarketplace,
  starEntry,
} from "../services/marketplace.js";

const searchSchema = z.object({
  q: z.string().trim().max(200).default(""),
  lang: z.string().optional(),
  useCase: z.enum(USE_CASE_IDS).optional(),
  industry: z.enum(INDUSTRY_IDS).optional(),
  format: z.enum(ITEM_FORMAT_IDS).optional(),
  capability: z.enum(CAPABILITY_IDS).optional(),
  plan: z.enum(MARKETPLACE_PLAN_IDS).optional(),
  starred: z
    .enum(["1", "0"])
    .optional()
    .transform((v) => v === "1"),
  limit: z.coerce.number().int().min(1).max(100).default(60),
  offset: z.coerce.number().int().min(0).default(0),
});

/** The marketplace for someone signed in: the search on "new", an entry, and the stars. */
export const marketplaceStudio = new Hono<{ Variables: { user: SessionUser } }>()
  .get("/", async (c) => {
    const { lang, ...search } = searchSchema.parse(c.req.query());
    return c.json(await searchMarketplace({ ...search, lang: asLang(lang) }));
  })
  .get("/:id", async (c) => {
    const detail = await marketplaceDetail(c.req.param("id"), asLang(c.req.query("lang")));
    return detail ? c.json(detail) : c.json({ error: "not found" }, 404);
  })
  .put("/:id/star", async (c) => {
    await starEntry(c.get("user").tenantId, c.req.param("id"), true);
    return c.json({ ok: true });
  })
  .delete("/:id/star", async (c) => {
    await starEntry(c.get("user").tenantId, c.req.param("id"), false);
    return c.json({ ok: true });
  });
