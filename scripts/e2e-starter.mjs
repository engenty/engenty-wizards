#!/usr/bin/env node
// Drives one starter wizard end to end through the API: fills its pages, accepts every
// review, then fetches each deliverable in each format. Local dev only (needs DEV_LOGIN=1).
//   node scripts/e2e-starter.mjs <starterId> '<answers json: {stepId: {field: value}}>'
import { writeFileSync } from "node:fs";

const base = process.env.API ?? "http://127.0.0.1:8891";
const [starterId, answersJson = "{}", outDir] = process.argv.slice(2);
const answers = JSON.parse(answersJson);

const login = await fetch(`${base}/api/dev/login`, { method: "POST" });
const cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
const call = async (method, path, body) => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { cookie, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
};

const [project] = await call("GET", "/api/studio/projects");
const { id: wizardId } = await call("POST", "/api/studio/wizards", { projectId: project.id, starterId });
const { runId } = await call("POST", `/api/studio/wizards/${wizardId}/test-runs`);
console.log(`wizard ${wizardId} run ${runId}`);

const started = Date.now();
let lastEvent = 0;
for (;;) {
  const view = await call("GET", `/api/runs/${runId}`);
  for (const e of view.events.filter((e) => e.id > lastEvent)) {
    console.log(`  [${Math.round((Date.now() - started) / 1000)}s] ${e.type} ${e.message}`);
    lastEvent = e.id;
  }
  if (view.status === "failed") {
    console.log("FAILED:", view.error);
    process.exit(1);
  }
  if (view.status === "waiting_input" && view.step.type === "page") {
    console.log(`→ page ${view.step.id}`);
    await call("POST", `/api/runs/${runId}/pages/${view.step.id}`, { values: answers[view.step.id] ?? {} });
  } else if (view.status === "waiting_input" && view.step.type === "review") {
    console.log(`→ review ${view.step.id}: ${view.shown.map((s) => s.step.id).join(", ")}`);
    await call("POST", `/api/runs/${runId}/reviews/${view.step.id}`, { type: "accept" });
  } else if (view.status === "done") {
    console.log(`DONE in ${Math.round((Date.now() - started) / 1000)}s`);
    for (const s of view.shown) {
      for (const f of s.formats) {
        const res = await fetch(`${base}/api/runs/${runId}/steps/${s.step.id}/download?format=${f}`, { headers: { cookie } });
        const buf = Buffer.from(await res.arrayBuffer());
        console.log(`  ${s.step.id}.${f}: ${res.status} ${res.headers.get("content-type")} ${buf.length} bytes`);
        if (outDir && res.ok) writeFileSync(`${outDir}/${starterId}-${s.step.id}.${f}`, buf);
      }
      if (s.output?.json) console.log("  json:", JSON.stringify(s.output.json).slice(0, 600));
    }
    process.exit(0);
  }
  if (Date.now() - started > 15 * 60_000) {
    console.log("TIMEOUT");
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 2500));
}
