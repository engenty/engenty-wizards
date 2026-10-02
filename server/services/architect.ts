import { eq } from "drizzle-orm";
import { runArchitect } from "../agents/architect.js";
import { charge, usdToMicros } from "../billing/credits.js";
import { listConnectors } from "../connectors/external.js";
import { db, schema } from "../db/client.js";
import { draftFiles } from "./files.js";
import { ownedProject } from "./projects.js";
import { addMessage, draftIssues, ownedWizard, wizardMessages } from "./wizards.js";

/** One studio chat turn: the architect reads the draft, its workspace and the thread, and changes them with tools. */
export async function architectTurn(
  userId: string,
  wizardId: string,
  message: string,
  io: {
    signal: AbortSignal;
    onText: (delta: string) => void;
    onActivity: (label: string) => void;
    onBuilding: () => void;
  },
) {
  const w = await ownedWizard(userId, wizardId);
  const history = await wizardMessages(w.id);
  const project = await ownedProject(userId, w.projectId);
  const userMessageId = await addMessage(w.id, { role: "user", content: message });
  try {
    const result = await runArchitect({
      userId,
      wizardId: w.id,
      message,
      history: history.map((m) => ({ role: m.role, content: m.content })),
      mcpServers: project.mcpServers.map((s) => ({ id: s.id, name: s.name })),
      connectors: await listConnectors(project.id),
      signal: io.signal,
      onText: io.onText,
      onActivity: io.onActivity,
      onBuilding: io.onBuilding,
    });
    await charge(userId, usdToMicros(result.costUsd), "architect");
    const reply = result.unfinished
      ? `${result.reply ? `${result.reply}\n\n` : ""}Ich bin noch nicht ganz fertig geworden. Schreib „weiter“, dann mache ich genau dort weiter.`
      : result.reply ||
        (result.changed
          ? "Erledigt."
          : "Das habe ich nicht verstanden – magst du es anders formulieren?");
    await addMessage(w.id, { role: "assistant", content: reply, changed: result.changed });
    const after = await ownedWizard(userId, wizardId);
    return {
      reply,
      changed: result.changed,
      draft: after.draft,
      revision: after.revision,
      files: await draftFiles(after.id),
      issues: await draftIssues(after),
    };
  } catch (err) {
    // An unanswered turn would repeat in the next turn's history.
    await db.delete(schema.wizardMessage).where(eq(schema.wizardMessage.id, userMessageId));
    throw err;
  }
}
