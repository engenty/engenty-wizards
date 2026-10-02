import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { AgentStep } from "../../shared/definition.js";
import type { ConnectionDef } from "../../shared/store.js";
import { importedConnector, refreshConnector } from "../connectors/external.js";
import { connectionContext } from "../connectors/index.js";
import type { ConnectorAction } from "../engenty/connections-sdk/types.js";
import type { StepContext } from "../engine/types.js";
import { attempt, clip } from "./shared.js";

/** Above this many actions a connector is offered as "find an action, then call it". */
const DIRECT_TOOLS = 24;
const TOOL_NAME = /^[a-zA-Z0-9_-]{1,64}$/;

/**
 * The actions of imported connectors a step may use, as tools. Reading is free; anything that
 * changes the person's account waits for their yes — engenty's default policy for connectors
 * (read: allow, write and destructive: ask), asked of the person who is running the wizard.
 */
export async function connectorTools(step: AgentStep, ctx: StepContext) {
  const tools: Record<string, any> = {};
  const connections = (ctx.def.connections ?? []).filter(
    (c) => c.connector && step.connections?.includes(c.id),
  );
  for (const connection of connections) {
    Object.assign(tools, await toolsOf(connection, ctx));
  }
  return tools;
}

/**
 * Whether the person is asked before an action runs. The wizard's author can settle it per
 * action (a server may call a plain lookup a change); deleting is never taken off the person.
 */
function asks(connection: ConnectionDef, action: ConnectorAction): boolean {
  if (action.group === "destructive") {
    return true;
  }
  return (connection.policy?.[action.id] ?? (action.group === "read" ? "allow" : "ask")) === "ask";
}

async function toolsOf(connection: ConnectionDef, ctx: StepContext) {
  const projectId = ctx.project.id;
  let imported = await importedConnector(projectId, connection.connector ?? "");
  if (!imported) {
    return {};
  }
  const account = () => connectionContext(ctx.store, connection, projectId);
  // An MCP server that lists its tools only to a signed-in account: ask it now that there is one.
  if (!imported.connector.actions.length) {
    const found = await account();
    if (found) {
      await refreshConnector(projectId, imported.record.id, found.ctx.accessToken).catch(
        () => undefined,
      );
      imported = (await importedConnector(projectId, imported.record.id)) ?? imported;
    }
  }
  const { connector, record } = imported;
  const usable = connection.actions
    ? connector.actions.filter((a) => connection.actions?.includes(a.id))
    : connector.actions.filter((a) => a.group === "read");
  const service = connection.title ?? connector.name;

  const call = (action: ConnectorAction, input: unknown) =>
    attempt(async () => {
      const found = await account();
      if (!found) {
        return {
          error: `The person has not connected ${service}. Go on without it and say so in your result.`,
        };
      }
      const key = `${connection.id}:${action.id}`;
      if (asks(connection, action) && !ctx.resources.allowed.has(key)) {
        const answer = await ctx.ask({
          kind: "confirm",
          reason: action.summary || action.id,
          service,
          action: {
            id: action.id,
            summary: action.summary,
            destructive: action.group === "destructive",
          },
          input: JSON.stringify(input ?? {}, null, 2).slice(0, 4000),
        });
        if (!answer) {
          return {
            error:
              "Nobody is there to allow this change, so it was not made. Report it as open in your result.",
          };
        }
        if (answer.type !== "done") {
          return {
            error:
              "The person did not allow this change. Do not try it again; say in your result that it was not made.",
          };
        }
        if (answer.remember) {
          ctx.resources.allowed.add(key);
        }
      }
      await ctx.emit("tool", `${service}: ${action.summary || action.id}`.slice(0, 120));
      const result = await action.handler(input ?? {}, found.ctx);
      const text = typeof result === "string" ? result : JSON.stringify(result);
      return { result: clip(text ?? "", 8000) };
    });

  const prefix = connector.toolPrefix;
  const direct =
    usable.length <= DIRECT_TOOLS && usable.every((a) => TOOL_NAME.test(`${prefix}_${a.id}`));
  if (direct) {
    return Object.fromEntries(
      usable.map((action) => [
        `${prefix}_${action.id}`,
        createTool({
          id: `${prefix}_${action.id}`,
          description: `${service}: ${action.description || action.summary}${
            asks(connection, action) ? " — the person is asked before this runs." : ""
          }`.slice(0, 1000),
          inputSchema: action.inputSchema as z.ZodType<any>,
          execute: (input) => call(action, input),
        }),
      ]),
    );
  }

  const schemas = new Map(record.actions.map((a) => [a.id, a.input_json_schema]));
  return {
    [`${prefix}_actions`]: createTool({
      id: `${prefix}_actions`,
      description: `${service} offers ${usable.length} actions. Find the ones you need by words from their name or purpose; you get each action's id, what it does and its input. Then call ${prefix}_call.`,
      inputSchema: z.object({
        query: z.string().describe("Words to look for, e.g. 'search pages' or 'invoice list'."),
      }),
      execute: ({ query }) =>
        attempt(async () => {
          const words = query.toLowerCase().split(/\s+/).filter(Boolean);
          const scored = usable
            .map((a) => {
              const text = `${a.id} ${a.summary} ${a.description}`.toLowerCase();
              return { a, score: words.filter((w) => text.includes(w)).length };
            })
            .filter((x) => x.score > 0)
            .sort((x, y) => y.score - x.score)
            .slice(0, 12);
          return {
            actions: scored.map(({ a }) => ({
              id: a.id,
              does: a.summary || a.description.slice(0, 200),
              asks_person_first: asks(connection, a),
              input: schemas.get(a.id) ?? {},
            })),
          };
        }),
    }),
    [`${prefix}_call`]: createTool({
      id: `${prefix}_call`,
      description: `Run one ${service} action found with ${prefix}_actions. Some wait for the person's yes first.`,
      inputSchema: z.object({
        action: z.string(),
        input: z.record(z.string(), z.unknown()).optional(),
      }),
      execute: ({ action: id, input }) => {
        const action = usable.find((a) => a.id === id);
        return action
          ? call(action, input)
          : Promise.resolve({ error: `No action "${id}". Use ${prefix}_actions to find one.` });
      },
    }),
  };
}
