import type { BrandView } from "@engenty-wizards/shared/run";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";

/** The project's first logo: the one end users, documents and widgets get. */
export async function mainLogoId(projectId: string): Promise<string | null> {
  const logo = await db.query.projectFile.findFirst({
    where: and(eq(schema.projectFile.projectId, projectId), eq(schema.projectFile.kind, "logo")),
    orderBy: [asc(schema.projectFile.position), asc(schema.projectFile.createdAt)],
  });
  return logo?.id ?? null;
}

/** What end users see of the project: its title, accent and logo — never the project name. */
export async function brandView(projectId: string): Promise<BrandView> {
  const p = await db.query.project.findFirst({ where: eq(schema.project.id, projectId) });
  const logo = p ? await mainLogoId(p.id) : null;
  return {
    name: p?.brand.name ?? "",
    accent: p?.brand.colors?.[0]?.value ?? null,
    logoUrl: logo ? `/api/public/logos/${logo}` : null,
  };
}
