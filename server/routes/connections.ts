import { and, desc, eq, max } from "drizzle-orm";
import { Hono } from "hono";
import type { SessionUser } from "../auth.js";
import { db, schema } from "../db/client.js";
import { SCOPES } from "../mcp/scopes.js";

type Vars = { Variables: { user: SessionUser } };

/** The auth adapter stores string arrays as JSON text. */
function scopesOf(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return raw.split(" ").filter(Boolean);
  }
}

/** MCP clients the admin connected over OAuth. "Trennen" removes the consent and the client's tokens. */
export const connections = new Hono<Vars>()
  .get("/", async (c) => {
    const userId = c.get("user").id;
    const rows = await db
      .select({
        clientId: schema.oauthConsent.clientId,
        name: schema.oauthClient.name,
        uri: schema.oauthClient.uri,
        scopes: schema.oauthConsent.scopes,
        connectedAt: schema.oauthConsent.createdAt,
      })
      .from(schema.oauthConsent)
      .innerJoin(schema.oauthClient, eq(schema.oauthClient.clientId, schema.oauthConsent.clientId))
      .where(eq(schema.oauthConsent.userId, userId))
      .orderBy(desc(schema.oauthConsent.updatedAt));
    // A client refreshes its token while in use, so the newest refresh token is its last use.
    const used = await db
      .select({
        clientId: schema.oauthRefreshToken.clientId,
        at: max(schema.oauthRefreshToken.createdAt),
      })
      .from(schema.oauthRefreshToken)
      .where(eq(schema.oauthRefreshToken.userId, userId))
      .groupBy(schema.oauthRefreshToken.clientId);
    return c.json(
      rows.map((r) => ({
        clientId: r.clientId,
        name: r.name || null,
        uri: r.uri,
        scopes: scopesOf(r.scopes).filter((s) => (SCOPES as readonly string[]).includes(s)),
        connectedAt: r.connectedAt,
        lastUsed: used.find((u) => u.clientId === r.clientId)?.at ?? r.connectedAt,
      })),
    );
  })
  .delete("/:clientId", async (c) => {
    const userId = c.get("user").id;
    const clientId = c.req.param("clientId");
    await db.transaction(async (tx) => {
      await tx
        .delete(schema.oauthAccessToken)
        .where(
          and(
            eq(schema.oauthAccessToken.userId, userId),
            eq(schema.oauthAccessToken.clientId, clientId),
          ),
        );
      await tx
        .delete(schema.oauthRefreshToken)
        .where(
          and(
            eq(schema.oauthRefreshToken.userId, userId),
            eq(schema.oauthRefreshToken.clientId, clientId),
          ),
        );
      await tx
        .delete(schema.oauthConsent)
        .where(
          and(eq(schema.oauthConsent.userId, userId), eq(schema.oauthConsent.clientId, clientId)),
        );
    });
    return c.json({ ok: true });
  });
