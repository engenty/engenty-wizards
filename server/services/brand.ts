import { eq } from "drizzle-orm";
import type { BrandView } from "../../shared/run.js";
import { db, schema } from "../db/client.js";

/** What end users see of the project: its brand name, accent and logo — never the project name. */
export async function brandView(projectId: string): Promise<BrandView> {
  const p = await db.query.project.findFirst({ where: eq(schema.project.id, projectId) });
  return {
    name: p?.brand.name ?? "",
    accent: p?.brand.accent ?? null,
    logoUrl: p?.brand.logoAssetId ? `/api/public/logos/${p.brand.logoAssetId}` : null,
  };
}
