import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { SessionUser } from "../auth.js";
import { subscribeDraft } from "../services/draft-events.js";
import { ownedWizard } from "../services/wizards.js";

type Vars = { Variables: { user: SessionUser } };

/**
 * Live changes to a wizard the editor has open — from an MCP client, the architect or another
 * tab. The editor refetches on `change`; `hello` carries the revision to catch up after a gap.
 */
export const wizardStream = new Hono<Vars>().get("/:id/stream", async (c) => {
  const w = await ownedWizard(c.get("user").id, c.req.param("id"));
  return streamSSE(c, async (stream) => {
    let closed = false;
    const unsubscribe = subscribeDraft(w.id, (change) => {
      if (!closed) {
        void stream.writeSSE({ event: "change", data: JSON.stringify(change) });
      }
    });
    stream.onAbort(() => {
      closed = true;
      unsubscribe();
    });
    await stream.writeSSE({ event: "hello", data: JSON.stringify({ revision: w.revision }) });
    while (!closed) {
      await stream.sleep(20_000);
      if (!closed) {
        await stream.writeSSE({ event: "ping", data: "" });
      }
    }
  });
});
