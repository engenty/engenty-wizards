import type { PluginSpace, PluginTool } from "@engenty-wizards/plugin-sdk";
import { type AgentStep, pluginToolOf } from "@engenty-wizards/shared/definition";
import { createTool } from "@mastra/core/tools";
import { type StepContext, StepError } from "../engine/types.js";
import { loadedPlugin, pluginIdsOf, pluginsOf } from "../plugins/registry.js";
import { attempt, clip } from "./shared.js";

/** The model's name of a plugin's tool: `<plugin>_<tool>`, since a tool name takes no dot. */
export function pluginToolName(plugin: string, tool: string): string {
  return `${plugin.replaceAll("-", "_")}_${tool}`;
}

/** A plugin's tool as an agent step calls it. */
function stepTool(plugin: string, tool: PluginTool, ctx: StepContext) {
  const id = pluginToolName(plugin, tool.name);
  const space = { id: ctx.project.id, name: ctx.project.name };
  return createTool({
    id,
    description: tool.description,
    inputSchema: tool.inputSchema,
    execute: (input) =>
      attempt(async () =>
        tool.execute(input, {
          runId: ctx.runId,
          stepId: ctx.stepId,
          tenantId: ctx.tenantId,
          space,
          project: space,
          wizard: { id: ctx.store.wizardId, title: ctx.def.title },
          mode: ctx.test ? "test" : "live",
          signal: ctx.signal,
          emit: (message) => ctx.emit("tool", message),
        }),
      ),
  });
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
    tools[pluginToolName(plugin, tool)] = stepTool(plugin, found, ctx);
  }
  return tools;
}

/** A block of a plugin is cut here: the step's instructions stay the step's. */
const MAX_BLOCK = 8000;

export interface SpaceContext {
  /** Blocks of the step's instructions, one per plugin context that has something to say. */
  blocks: string[];
  /** The tools that come with them. */
  tools: Record<string, any>;
}

const contexts = new WeakMap<StepContext, Promise<SpaceContext>>();

/**
 * What the tenant's plugins add to an agent step of a space's wizard (`registerSpaceContext`):
 * asked once per step, for its instructions and for its tools. A context that fails adds nothing.
 */
export function spaceContextOf(ctx: StepContext): Promise<SpaceContext> {
  let found = contexts.get(ctx);
  if (!found) {
    found = gather(ctx);
    contexts.set(ctx, found);
  }
  return found;
}

async function gather(ctx: StepContext): Promise<SpaceContext> {
  const space: PluginSpace = { id: ctx.project.id, name: ctx.project.name };
  const result: SpaceContext = { blocks: [], tools: {} };
  for (const plugin of await pluginsOf(ctx.tenantId)) {
    for (const context of plugin.contexts) {
      const block = await Promise.resolve()
        .then(() => context.block(space))
        .catch((err) => {
          console.error(`[plugin ${plugin.source.id}] space context:`, err);
          return null;
        });
      if (!block?.trim()) {
        continue;
      }
      result.blocks.push(clip(block.trim(), MAX_BLOCK));
      for (const tool of context.tools ?? []) {
        result.tools[pluginToolName(plugin.source.id, tool.name)] = stepTool(
          plugin.source.id,
          tool,
          ctx,
        );
      }
    }
  }
  return result;
}

/** What the space assistant hands the tools of plugins for one turn. */
export interface AssistantTurn {
  tenantId: string;
  space: PluginSpace;
  userId: string;
  signal: AbortSignal;
  emit(message: string): void;
  changed(): void;
  /** A tool registered with `card: true` returned: the chat draws its card. */
  card(card: { plugin: string; tool: string; data: unknown }): void;
}

/** The tenant's plugins' tools of the space assistant (`registerAssistantTool`). */
export async function assistantToolsOf(turn: AssistantTurn): Promise<Record<string, any>> {
  const tools: Record<string, any> = {};
  for (const plugin of await pluginsOf(turn.tenantId)) {
    for (const tool of plugin.assistantTools.values()) {
      const id = pluginToolName(plugin.source.id, tool.name);
      tools[id] = createTool({
        id,
        description: tool.description,
        inputSchema: tool.inputSchema,
        execute: (input) =>
          attempt(async () => {
            const result = await tool.execute(input, {
              tenantId: turn.tenantId,
              space: turn.space,
              userId: turn.userId,
              signal: turn.signal,
              emit: turn.emit,
              changed: turn.changed,
            });
            if (tool.card) {
              turn.card({ plugin: plugin.source.id, tool: tool.name, data: result ?? null });
            }
            return result;
          }),
      });
    }
  }
  return tools;
}

/**
 * The admin talks to the space assistant from a plugin's own page: what the plugin says that page
 * holds now, and its name. `null` when the tenant has no such plugin.
 */
export async function assistantPageOf(
  tenantId: string,
  pluginId: string,
  space: { id: string; name: string },
): Promise<{ name: string; description: string | null; blocks: string[] } | null> {
  const plugin = (await pluginsOf(tenantId)).find((p) => p.source.id === pluginId);
  if (!plugin) {
    return null;
  }
  const blocks: string[] = [];
  for (const page of plugin.assistantPages) {
    try {
      const text = await page.block(space);
      if (text?.trim()) {
        blocks.push(text.trim().slice(0, MAX_BLOCK));
      }
    } catch (err) {
      console.error(`[plugins] ${pluginId}: the assistant's page block failed:`, err);
    }
  }
  return {
    name: plugin.source.manifest.name,
    description: plugin.source.manifest.description ?? null,
    blocks,
  };
}
