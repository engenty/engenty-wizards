import { serve } from "@hono/node-server";
import app from "./app.js";
import { migrateDb } from "./db/client.js";
import { resumeInterruptedRuns } from "./engine/runner.js";
import { env } from "./env.js";
import { loadCatalog } from "./models.js";
import { closeBrowser } from "./render/chromium.js";
import { purgeExpiredRuns } from "./services/shares.js";

await migrateDb();
void loadCatalog();

const server = serve({ fetch: app.fetch, port: env.port, hostname: "0.0.0.0" }, (info) => {
  console.log(`engenty wizards API on :${info.port} — open ${env.appUrl}`);
});

await resumeInterruptedRuns();

// End-user results are kept RESULT_TTL_DAYS; expired runs and their files go once an hour.
const purge = () => purgeExpiredRuns().catch((err) => console.error("[retention]", err));
void purge();
setInterval(purge, 60 * 60 * 1000).unref();

async function shutdown() {
  server.close();
  await closeBrowser();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
