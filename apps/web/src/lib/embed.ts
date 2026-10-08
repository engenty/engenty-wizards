import { useEffect } from "react";

/**
 * How another website shows the wizard (`public/embed.js` there): `inline` in the page, as tall
 * as its content, `modal` in a window behind a button, or `popout` as a chat that opens above a
 * button in the page's corner. `null`: the wizard's own page.
 */
export type Embed = "inline" | "modal" | "popout";

function read(): Embed | null {
  if (window.self === window.top) {
    return null;
  }
  const mode = new URLSearchParams(window.location.search).get("embed");
  return mode === "inline" || mode === "modal" || mode === "popout" ? mode : null;
}

/** Read once: the address loses `?embed=` with the first step, the frame stays the same. */
export const EMBED = read();

/**
 * How the wizard talks to the person: page by page (`steps`, the default) or as a chat
 * (`?ui=chat`). A popout is always a chat.
 */
export const UI: "steps" | "chat" =
  EMBED === "popout" || new URLSearchParams(window.location.search).get("ui") === "chat"
    ? "chat"
    : "steps";

/** An address of the wizard's own page that stays in the chat when it is opened again. */
export const keepUi = (path: string) => (UI === "chat" && !EMBED ? `${path}?ui=chat` : path);

const tell = (type: "height" | "close", data: Record<string, unknown> = {}) =>
  window.parent.postMessage({ type: `engenty-wizard:${type}`, ...data }, "*");

/** The website closes the window or the chat the wizard is shown in. */
export const closeEmbed = () => tell("close");

/**
 * What the embedding page must hear: inline the wizard's height, in a window an Esc. An inline
 * chat keeps the height the website gives it and scrolls inside.
 */
export function useEmbed() {
  useEffect(() => {
    if (EMBED === "inline" && UI === "steps") {
      const root = document.documentElement;
      // The page is as tall as its content, not as its frame; the website scrolls, the frame never.
      document.getElementById("root")?.style.setProperty("min-height", "0");
      root.style.overflow = "hidden";
      const observer = new ResizeObserver(() =>
        tell("height", { height: Math.ceil(root.getBoundingClientRect().height) }),
      );
      observer.observe(root);
      return () => observer.disconnect();
    }
    if (EMBED === "modal" || EMBED === "popout") {
      // Keys pressed in the frame never reach the website; a dialog of the wizard's own closes first.
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape" && !document.querySelector("dialog[open]")) {
          tell("close");
        }
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }
  }, []);
}
