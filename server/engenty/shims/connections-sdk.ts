/**
 * Stand-in for `@engenty/connections-sdk`: the contracts, OAuth2 and registry are engenty's own
 * files; what engenty binds to its database and plugin host is provided here.
 */
import { seal, unseal } from "../../crypto.js";
import type { ConnectorDefinition } from "../connections-sdk/types.js";

export * from "../connections-sdk/oauth2.js";
export * from "../connections-sdk/registry.js";
export * from "../connections-sdk/types.js";

/** Secrets of imported connectors (OAuth client id and secret) at rest. */
export function encryptToken(plain: string): string {
  return seal(plain);
}

export function decryptToken(value: string): string {
  const plain = unseal<string>(value);
  if (plain === null) {
    throw new Error("stored connector secret cannot be read");
  }
  return plain;
}

/** engenty adds file actions for connectors with a files capability; wizards have none. */
export function defineConnector(definition: ConnectorDefinition): ConnectorDefinition {
  return definition;
}
