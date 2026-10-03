import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal as Xterm } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef } from "react";
import { api } from "../lib/api";
import { cn } from "../ui";
import { openExternal } from "./LocalRuntime";

/**
 * A terminal of the runtime, shown inline: what the command prints arrives as a stream, every
 * key goes back to it. The runtime keeps the session; this is its screen and keyboard.
 */
export function Terminal({
  id,
  onExit,
  onDone,
  className,
}: {
  id: string;
  /** The command ended with this exit code. */
  onExit?: (code: number) => void;
  /** The command did what it was started for; it may still be running. */
  onDone?: () => void;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const exit = useRef(onExit);
  exit.current = onExit;
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const el = host.current;
    if (!el) {
      return;
    }
    const term = new Xterm({
      fontSize: 13,
      lineHeight: 1.2,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      cursorBlink: true,
      scrollback: 3000,
      theme: {
        background: "#0f1424",
        foreground: "#e6e9f2",
        cursor: "#f0b35b",
        selectionBackground: "#2f3a5f",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    // A sign-in link the browser did not open by itself: a click opens it.
    term.loadAddon(new WebLinksAddon((_event, uri) => openExternal(uri)));
    term.open(el);
    const path = `/api/studio/local/terminal/${id}`;
    const quiet = () => undefined;
    const sync = () => {
      try {
        fit.fit();
      } catch {
        // not laid out yet
      }
      void api.post(`${path}/resize`, { cols: term.cols, rows: term.rows }).catch(quiet);
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    const input = term.onData((data) => void api.post(`${path}/input`, { data }).catch(quiet));
    const source = new EventSource(`${path}/stream`, { withCredentials: true });
    source.addEventListener("data", (e) => {
      term.write((JSON.parse((e as MessageEvent).data) as { data: string }).data);
    });
    source.addEventListener("done", () => done.current?.());
    source.addEventListener("exit", (e) => {
      source.close();
      exit.current?.((JSON.parse((e as MessageEvent).data) as { code: number }).code);
    });
    term.focus();
    return () => {
      source.close();
      observer.disconnect();
      input.dispose();
      term.dispose();
    };
  }, [id]);
  return (
    <div
      ref={host}
      className={cn(
        "h-[28rem] max-h-[60dvh] w-full overflow-hidden rounded-lg bg-[#0f1424] p-2",
        className,
      )}
    />
  );
}
