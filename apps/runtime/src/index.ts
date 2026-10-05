import { serve } from "@hono/node-server";
import { localEntryUrl, purgeSessions } from "./auth/index.js";
import { adoptLegacyData } from "./db/adopt.js";
import {
  knownTenants,
  migrateAllTenants,
  migrateControlDb,
  openTenantDb,
  withTenant,
} from "./db/client.js";
import { resumeInterruptedRuns } from "./engine/runner.js";
import { basePath, env } from "./env.js";
import { managed } from "./manage.js";
import { loadCatalog, loadLocalModels } from "./models.js";
import { closeBrowser } from "./render/chromium.js";
import { clearRunning, writeRunning } from "./running.js";
import { syncMarketplace } from "./services/marketplace.js";
import { purgeExpiredRuns } from "./services/shares.js";
import { purgeUnusedStores } from "./store/index.js";
import { LOCAL_TENANT } from "./tenants/tenant.js";
import { onRestart } from "./update.js";

await migrateControlDb();
if (managed) {
  // Every tenant database is brought to this release's schema; a new one migrates when first opened.
  void migrateAllTenants().then(({ migrated, failed }) => {
    console.log(
      `tenant databases: ${migrated} current${failed.length ? `, failed: ${failed}` : ""}`,
    );
  });
} else {
  await adoptLegacyData();
  await openTenantDb(LOCAL_TENANT);
  await loadLocalModels();
  void loadCatalog();
}

// The marketplace's starters and the starred entries, kept for offline use; checked hourly.
void syncMarketplace();
setInterval(() => void syncMarketplace(), 3600_000).unref();

const { default: app } = await import("./app.js");

/** Behind a path (APP_URL ends in /w) the proxy may leave the prefix on; the routes know none. */
function withoutBasePath(request: Request) {
  const url = new URL(request.url);
  if (basePath && (url.pathname === basePath || url.pathname.startsWith(`${basePath}/`))) {
    url.pathname = url.pathname.slice(basePath.length) || "/";
    return app.fetch(new Request(url, request));
  }
  return app.fetch(request);
}

const server = serve({ fetch: withoutBasePath, port: env.port, hostname: env.host }, (info) => {
  console.log(`engenty wizards on :${info.port} — ${env.appUrl}`);
  const entry = localEntryUrl();
  if (entry && !env.local.accessKey) {
    console.log(`Open the studio: ${entry}`);
  }
  if (!managed) {
    writeRunning(env.dataDir, {
      pid: process.pid,
      port: info.port,
      url: env.appUrl,
      startedAt: new Date().toISOString(),
    });
  }
});

await resumeInterruptedRuns();

// End-user results are kept RESULT_TTL_DAYS; expired runs and their files go once an hour.
// What a wizard keeps for a person goes once nobody used it for STORE_TTL_DAYS.
async function purge() {
  await purgeSessions();
  for (const id of await knownTenants()) {
    await withTenant(id, () => Promise.all([purgeExpiredRuns(), purgeUnusedStores()])).catch(
      (err) => console.error(`[retention ${id}]`, err),
    );
  }
}
void purge().catch((err) => console.error("[retention]", err));
setInterval(() => void purge().catch((err) => console.error("[retention]", err)), 3600_000).unref();

async function shutdown(code = 0) {
  clearRunning(env.dataDir);
  server.close();
  await closeBrowser();
  process.exit(code);
}
process.on("SIGINT", () => shutdown());
process.on("SIGTERM", () => shutdown());
onRestart((code) => void shutdown(code));
