import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { control, controlDb } from "../db/client.js";
import { env } from "../env.js";
import { currentTenant } from "../tenants/tenant.js";

/**
 * Public addresses of plugins (`server.publicUrl`): `/api/public/plugins/<plugin>/<ref>/…`. The
 * ref names the tenant without giving its id away; one per tenant and plugin, kept for good.
 */

/** The full address of a plugin's public route for the current tenant. */
export async function publicUrlOf(plugin: string, path: string): Promise<string> {
  const tenantId = currentTenant();
  const where = and(
    eq(control.pluginAddress.tenantId, tenantId),
    eq(control.pluginAddress.plugin, plugin),
  );
  let row = await controlDb.query.pluginAddress.findFirst({ where });
  if (!row) {
    await controlDb
      .insert(control.pluginAddress)
      .values({ ref: nanoid(24), tenantId, plugin })
      .onConflictDoNothing();
    row = (await controlDb.query.pluginAddress.findFirst({ where }))!;
  }
  const rest = path.startsWith("/") ? path : `/${path}`;
  return `${env.appUrl}/api/public/plugins/${plugin}/${row.ref}${rest === "/" ? "" : rest}`;
}

/** The tenant a plugin's public address belongs to. */
export async function tenantOfAddress(plugin: string, ref: string): Promise<string | null> {
  const row = await controlDb.query.pluginAddress.findFirst({
    where: eq(control.pluginAddress.ref, ref),
  });
  return row?.plugin === plugin ? row.tenantId : null;
}
