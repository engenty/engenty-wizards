// Runs in the top frame of every page the main window loads, before the page's own scripts.
// The commands it calls are granted to the chosen server's origin only; any other page that
// ends up in the window is refused by the app.
(() => {
  if (window.top !== window || !/^https?:$/.test(location.protocol)) {
    return;
  }
  const invoke = (command, args) => {
    try {
      return window.__TAURI_INTERNALS__.invoke(command, args).catch(() => undefined);
    } catch {
      return Promise.resolve(undefined);
    }
  };
  const webUrl = (value) => {
    try {
      const url = new URL(String(value), location.href);
      return url.protocol === "http:" || url.protocol === "https:" ? url : null;
    } catch {
      return null;
    }
  };
  /** Opens an address in the person's own browser. */
  const openExternal = (value) => {
    const url = webUrl(value);
    if (url) {
      void invoke("open_external", { url: url.href });
    }
    return Boolean(url);
  };

  Object.defineProperty(window, "engentyDesktop", {
    value: Object.freeze({
      open: (url) => void openExternal(url),
      chooseServer: () => void invoke("open_server_choice"),
    }),
  });

  // window.open leads to the person's browser, never to a second window of this app. A popup
  // opened empty and sent somewhere afterwards (sign-in flows do that) works the same way.
  window.open = (url) => {
    if (url && String(url) !== "about:blank") {
      openExternal(url);
      return null;
    }
    const popup = { closed: false, focus() {}, blur() {}, postMessage() {} };
    popup.close = () => {
      popup.closed = true;
    };
    const go = (next) => {
      if (!popup.closed) {
        openExternal(next);
      }
    };
    const address = {
      replace: go,
      assign: go,
      get href() {
        return "about:blank";
      },
      set href(next) {
        go(next);
      },
    };
    Object.defineProperty(popup, "location", { get: () => address, set: go });
    return popup;
  };

  document.addEventListener(
    "click",
    (event) => {
      if (event.defaultPrevented || event.button !== 0) {
        return;
      }
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      const url = anchor ? webUrl(anchor.href) : null;
      if (!url) {
        return;
      }
      const target = (anchor.getAttribute("target") || "").toLowerCase();
      const newWindow = target !== "" && !["_self", "_top", "_parent"].includes(target);
      if (newWindow || event.metaKey || event.ctrlKey) {
        event.preventDefault();
        openExternal(url.href);
        return;
      }
      // An API address is never a page of the app: a link to one is a file to save. Without
      // this the window would show a PDF or play an MP4 in place of the studio.
      const api = url.origin === location.origin && /^\/api\/(?!auth\/|local\/)/.test(url.pathname);
      if (api && !anchor.hasAttribute("download")) {
        anchor.setAttribute("download", "");
      }
    },
    true,
  );

  // The title bar takes the colour of the page behind it.
  let last = "";
  const tint = () => {
    if (!document.body) {
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    for (const element of [document.body, document.documentElement]) {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = getComputedStyle(element).backgroundColor;
      context.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
      if (a === 255) {
        const key = `${r},${g},${b}`;
        if (key !== last) {
          last = key;
          void invoke("set_chrome", { r, g, b });
        }
        return;
      }
    }
  };
  const watch = () => {
    tint();
    new MutationObserver(tint).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "data-theme"],
    });
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", tint);
    window.addEventListener("load", tint);
    setTimeout(tint, 1000);
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", watch);
  } else {
    watch();
  }
})();
