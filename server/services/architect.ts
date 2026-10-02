import { eq } from "drizzle-orm";
import { runArchitect } from "../agents/architect.js";
import { charge, usdToMicros } from "../billing/credits.js";
import { db, schema } from "../db/client.js";
import { ownedProject } from "./projects.js";
import { addMessage, ownedWizard, wizardMessages, writeDraft } from "./wizards.js";

/** One studio chat turn: the architect reads the draft and the thread, and may rewrite the draft. */
export async function architectTurn(
  userId: string,
  wizardId: string,
  message: string,
  io: { signal: AbortSignal; onText: (delta: string) => void; onBuilding: () => void },
) {
  const w = await ownedWizard(userId, wizardId);
  const history = await wizardMessages(w.id);
  const project = await ownedProject(userId, w.projectId);
  const blank = history.length === 0 && !w.starter;
  const userMessageId = await addMessage(w.id, { role: "user", content: message });
  try {
    const result = await runArchitect({
      message,
      current: blank ? null : w.draft,
      history: history.map((m) => ({ role: m.role, content: m.content })),
      mcpServers: project.mcpServers.map((s) => ({ id: s.id, name: s.name })),
      signal: io.signal,
      onText: io.onText,
      onBuilding: io.onBuilding,
    });
    await charge(userId, usdToMicros(result.costUsd), "architect");
    const written = result.wizard
      ? await writeDraft(userId, w.id, { definition: result.wizard, baseRevision: w.revision })
      : null;
    const changed = Boolean(written);
    const reply =
      result.reply ||
      (changed ? "Erledigt." : "Das habe ich nicht verstanden – magst du es anders formulieren?");
    await addMessage(w.id, { role: "assistant", content: reply, changed });
    return {
      reply,
      changed,
      draft: written?.draft ?? w.draft,
      revision: written?.revision ?? w.revision,
      issues: result.issues,
    };
  } catch (err) {
    // An unanswered turn would repeat in the next turn's history.
    await db.delete(schema.wizardMessage).where(eq(schema.wizardMessage.id, userMessageId));
    throw err;
  }
}
