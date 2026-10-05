import { type AgentStep, pluginToolOf } from "@engenty-wizards/shared/definition";
import { createTool } from "@mastra/core/tools";
import { type StepContext, StepError } from "../engine/types.js";
import { loadedPlugin, pluginIdsOf } from "../plugins/registry.js";
import { attempt } from "./shared.js";

/** The model's name of a plugin's tool: `<plugin>_<tool>`, since a tool name takes no dot. */
export function pluginToolName(plugin: string, tool: string): string {
  return `${plugin.replaceAll("-", "_")}_${tool}`;
}

/**
 * The tools of plugins a step allowlists as `<plugin>.<tool>`. A step that names a tool this
 * tenant does not have fails: the wizard was written for a runtime with that plugin.
 */
export async function pluginTools(step: AgentStep, ctx: StepContext): Promise<Record<string, any>> {
  const wanted = step.tools.map(pluginToolOf).filter((named) => named !== null);
  if (!wanted.length) {
    return {};
  }
  const tools: Record<string, any> = {};
  const has = await pluginIdsOf(ctx.tenantId);
  for (const { plugin, tool } of wanted) {
    const found = has.has(plugin) ? loadedPlugin(plugin)?.tools.get(tool) : undefined;
    if (!found) {
      throw new StepError(
        `Dieser Schritt braucht das Werkzeug „${plugin}.${tool}“. Das Plugin „${plugin}“ ist hier nicht installiert.`,
      );
    }
    const id = pluginToolName(plugin, tool);
    tools[id] = createTool({
      id,
      description: found.description,
      inputSchema: found.inputSchema,
      execute: (input) =>
        attempt(async () =>
          found.execute(input, {
            runId: ctx.runId,
            stepId: ctx.stepId,
            tenantId: ctx.tenantId,
            project: { id: ctx.project.id, name: ctx.project.name },
            wizard: { title: ctx.def.title },
            signal: ctx.signal,
            emit: (message) => ctx.emit("tool", message),
          }),
        ),
    });
  }
  return tools;
}
