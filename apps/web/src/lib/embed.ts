import { useEffect } from "react";

/**
 * How another website shows the wizard (`public/embed.js` there): `inline` in the page, as tall
 * as its content, or `modal` in a window behind a button. `null`: the wizard's own page.
 */
export type Embed = "inline" | "modal";

function read(): Embed | null {
  if (window.self === window.top) {
    return null;
  }
  const mode = new URLSearchParams(window.location.search).get("embed");
  return mode === "inline" || mode === "modal" ? mode : null;
}

/** Read once: the address loses `?embed=` with the first step, the frame stays the same. */
export const EMBED = read();

const tell = (type: "height" | "close", data: Record<string, unknown> = {}) =>
  window.parent.postMessage({ type: `engenty-wizard:${type}`, ...data }, "*");

/** What the embedding page must hear: inline the wizard's height, in the window an Esc. */
export function useEmbed() {
  useEffect(() => {
    if (EMBED === "inline") {
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
    if (EMBED === "modal") {
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
