import { getRandomValues } from "expo-crypto";
import * as SecureStore from "expo-secure-store";

/**
 * Who the person is to a runtime: one visitor id per runtime (the `wz_vid` cookie the runner
 * sets in a browser), kept in the Keychain / Keystore. A run belongs to its visitor; the runtime
 * needs no account for it.
 */

const ALPHABET = "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";
const cache = new Map<string, Promise<string>>();

/** SecureStore keys take letters, digits, `.`, `-` and `_` only. */
const keyOf = (runtime: string) => `vid.${runtime.replace(/[^\w.-]/g, "_")}`;

function newId(): string {
  const bytes = getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => ALPHABET[b & 63]).join("");
}

export function visitorId(runtime: string): Promise<string> {
  let found = cache.get(runtime);
  if (!found) {
    found = (async () => {
      const key = keyOf(runtime);
      const kept = await SecureStore.getItemAsync(key);
      if (kept) {
        return kept;
      }
      const id = newId();
      await SecureStore.setItemAsync(key, id);
      return id;
    })();
    cache.set(runtime, found);
  }
  return found;
}
