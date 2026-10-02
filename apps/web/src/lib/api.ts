import { t } from "./i18n";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: any,
  ) {
    super(message);
  }
}

/** The request never reached the server: no network, a tunnel, a phone switching cells. */
export function isOffline(err: unknown): boolean {
  return err instanceof ApiError && err.status === 0;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: "include",
    headers:
      body !== undefined && !(body instanceof FormData)
        ? { "content-type": "application/json" }
        : undefined,
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  }).catch(() => {
    throw new ApiError(t("common.offline"), 0, null);
  });
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    throw new ApiError(data?.error ?? res.statusText, res.status, data);
  }
  return data as T;
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
  upload: <T>(path: string, file: File) => {
    const form = new FormData();
    form.set("file", file);
    return request<T>("POST", path, form);
  },
};

/** POST that answers with Server-Sent Events. */
export async function postStream(
  path: string,
  body: unknown,
  onEvent: (event: string, data: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(path, {
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
