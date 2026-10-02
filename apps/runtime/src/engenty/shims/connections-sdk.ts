/**
 * Stand-in for `@engenty/connections-sdk`: the contracts, OAuth2 and registry are engenty's own
 * files; what engenty binds to its database and plugin host is provided here.
 */
import { seal, unseal } from "../../secrets/crypto.js";
import { filesCapabilityActions } from "../connections-sdk/files-capability.js";
import { storageCapabilityActions } from "../connections-sdk/storage-capability.js";
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

/**
 * Finalises a connector definition as engenty's runtime does: a `files` capability becomes the
 * read actions `files_list` / `files_read` / `files_stat` / `files_search`, a `storage`
 * capability the write actions `files_write` / `files_delete` / `files_move`.
 */
export function defineConnector(def: ConnectorDefinition): ConnectorDefinition {
  if (!(def.files || def.storage)) {
    return def;
  }
  return {
    ...def,
    actions: [
      ...def.actions,
      ...(def.files ? filesCapabilityActions(def.files, def.filesProviderScopes) : []),
      ...(def.storage ? storageCapabilityActions(def.storage, def.storageProviderScopes) : []),
    ],
  };
}
