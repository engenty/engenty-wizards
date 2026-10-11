import { ApiError, createApi, isOffline } from "@engenty-wizards/runner";
import { withBase } from "./base";
import { report } from "./report";

export { ApiError, isOffline };

/** JSON calls to this runtime, under the app's base path (and a remote runtime's ticket); a 5xx goes to the log. */
export const api = createApi(withBase, {}, (line) => report("error", line));

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

/** POST that answers with Server-Sent Events. */
export async function postStream(
  path: string,
  body: unknown,
  onEvent: (event: string, data: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(withBase(path), {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    const data = safeJson(await res.text());
    throw new ApiError(data?.error ?? res.statusText, res.status, data);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    let idx = buffer.indexOf("\n\n");
    while (idx !== -1) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      let event = "message";
      const data: string[] = [];
      for (const line of chunk.split("\n")) {
        if (line.startsWith("event:")) {
          event = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          data.push(line.slice(5).replace(/^ /, ""));
        }
      }
      onEvent(event, data.join("\n"));
      idx = buffer.indexOf("\n\n");
    }
  }
}
