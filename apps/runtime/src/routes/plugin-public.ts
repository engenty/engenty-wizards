import type { PluginPublicRequest } from "@engenty-wizards/plugin-sdk";
import { type Context, Hono } from "hono";
import { withTenant } from "../db/client.js";
import { tenantOfAddress } from "../plugins/public.js";
import { loadedPlugin, pluginIdsOf } from "../plugins/registry.js";
import { tenantStatus } from "../tenants/control.js";
import { answerOf } from "./plugins.js";

/**
 * Plugins' public routes (`server.registerPublicRoute`), below `/api/public/plugins/<id>/<ref>`.
 * Nobody is signed in: the ref names the tenant, and the plugin checks a secret of its own.
 */

const notFound = (c: Context) => c.json({ error: "not found", code: "not_found" }, 404);

async function dispatch(c: Context): Promise<Response> {
  const id = c.req.param("id") ?? "";
  const ref = c.req.param("ref") ?? "";
  const tenantId = await tenantOfAddress(id, ref);
  if (!tenantId || (await tenantStatus(tenantId)) !== "active") {
    return notFound(c);
  }
  const plugin = (await pluginIdsOf(tenantId)).has(id) ? loadedPlugin(id) : undefined;
  if (!plugin) {
    return notFound(c);
  }
  const url = new URL(c.req.url);
  const marker = `/plugins/${id}/${ref}`;
  const path = url.pathname.slice(url.pathname.indexOf(marker) + marker.length);
  for (const { route, pattern, params } of plugin.publicRoutes) {
    const match = route.method === c.req.method ? pattern.exec(path) : null;
    if (!match) {
      continue;
    }
    const request: PluginPublicRequest = {
      request: c.req.raw,
      path: path || "/",
      params: Object.fromEntries(params.map((name, i) => [name, decodeURIComponent(match[i + 1])])),
      query: url.searchParams,
      tenantId,
      json: async <T>() => {
        const text = await c.req.text();
        return (text ? JSON.parse(text) : {}) as T;
      },
    };
    try {
      const result = await withTenant(tenantId, () => route.handler(request));
      return result instanceof Response ? result : c.json(result ?? null);
    } catch (err) {
      const answer = answerOf(err);
      if (answer) {
        return c.json(answer.body, answer.status as 400);
      }
      console.error(`[plugin ${id}] public ${route.method} ${path}:`, err);
      return c.json({ error: "The plugin failed.", code: "plugin_failed" }, 500);
    }
  }
  return notFound(c);
}

export const publicPluginRoutes = new Hono()
  .all("/:id/:ref", dispatch)
  .all("/:id/:ref/*", dispatch);
