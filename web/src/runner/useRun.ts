import type { RunView } from "@shared/run";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api } from "../lib/api";

/** Live view of one run: a server-sent stream of the whole view, plus the commands a person can give. */
export function useRun(runId: string | null) {
  const [view, setView] = useState<RunView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const source = useRef<EventSource | null>(null);

  useEffect(() => {
    setView(null);
    setNotFound(false);
    if (!runId) {
      return;
    }
    let stopped = false;
    let retry = 0;
    const open = () => {
      if (stopped) {
        return;
      }
      const es = new EventSource(`/api/runs/${runId}/stream`, { withCredentials: true });
      source.current = es;
      es.addEventListener("view", (e) => {
        retry = 0;
        setView(JSON.parse((e as MessageEvent).data));
      });
      es.onerror = async () => {
        es.close();
        if (stopped) {
          return;
        }
        try {
          setView(await api.get<RunView>(`/api/runs/${runId}`));
        } catch (err) {
          if (err instanceof ApiError && err.status === 404) {
            setNotFound(true);
            return;
          }
        }
        retry = Math.min(retry + 1, 6);
        setTimeout(open, 500 * 2 ** retry);
      };
    };
    open();
    return () => {
      stopped = true;
      source.current?.close();
    };
  }, [runId]);

  const command = useCallback(
    async (path: string, body?: unknown) => {
      if (!runId) {
        return false;
      }
      setBusy(true);
      setError(null);
      setFieldErrors({});
      try {
        await api.post(`/api/runs/${runId}/${path}`, body);
        return true;
      } catch (err) {
        if (err instanceof ApiError && err.status === 422 && Array.isArray(err.body?.fields)) {
          setFieldErrors(
            Object.fromEntries(
              err.body.fields.map((f: { field: string; message: string }) => [f.field, f.message]),
            ),
          );
        }
        setError((err as Error).message);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [runId],
  );

  return {
    view,
    notFound,
    error,
    busy,
    fieldErrors,
    submitPage: (stepId: string, values: Record<string, unknown>) =>
      command(`pages/${stepId}`, { values }),
    accept: (stepId: string, edits?: Record<string, string>) =>
      command(`reviews/${stepId}`, { type: "accept", edits }),
    regenerate: (stepId: string, target: string, note: string) =>
      command(`reviews/${stepId}`, { type: "regenerate", target, note }),
    back: () => command("back"),
    retry: () => command("retry"),
  };
}
