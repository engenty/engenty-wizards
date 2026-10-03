// The tag a website shows a wizard with. Where the tag stands, the wizard appears:
//
//   <script async src="https://…/embed.js" data-wizard="<token>"></script>
//     in the page, as tall as its content
//   <script async src="https://…/embed.js" data-wizard="<token>" data-mode="modal" data-label="Start"></script>
//     a button that opens it in a window over the page
//
// The button takes the website's own styles: `.engenty-wizard-button`.
(() => {
  const script = document.currentScript;
  const token = script?.dataset.wizard;
  if (!script || !token) {
    return;
  }
  // The app lives where this file does: https://example.com/wizards/embed.js → …/wizards/w/<token>.
  const app = new URL(".", script.src);
  const mode = script.dataset.mode === "modal" ? "modal" : "inline";
  const label = script.dataset.label || "Start";

  const frame = () => {
    const el = document.createElement("iframe");
    el.src = `${app.href}w/${encodeURIComponent(token)}?embed=${mode}`;
    el.title = label;
    // What a page of the wizard may ask the visitor for: photos, voice notes, the position.
    el.allow = "camera; microphone; geolocation; clipboard-write; fullscreen; screen-wake-lock";
    return el;
  };
  /** What the wizard in `el` tells this page (`lib/embed.ts`). */
  const listen = (el, type, then) =>
    addEventListener("message", (event) => {
      if (
        event.source === el.contentWindow &&
        event.origin === app.origin &&
        event.data?.type === `engenty-wizard:${type}`
      ) {
        then(event.data);
      }
    });

  if (mode === "inline") {
    const el = frame();
    el.style.cssText = "display:block;width:100%;height:640px;border:0";
    listen(el, "height", ({ height }) => {
      el.style.height = `${Number(height) || 640}px`;
    });
    script.after(el);
    return;
  }

  if (!document.getElementById("engenty-wizard-style")) {
    const style = document.createElement("style");
    style.id = "engenty-wizard-style";
    // :where() weighs nothing, so any rule of the website restyles the button.
    style.textContent = `
:where(.engenty-wizard-button){font:inherit;font-weight:600;line-height:1.2;color:#fff;background:#1c1917;border:0;border-radius:999px;padding:.8em 1.6em;cursor:pointer}
.engenty-wizard-dialog{position:fixed;inset:0;width:min(720px,calc(100vw - 32px));height:min(860px,calc(100dvh - 32px));max-width:none;max-height:none;margin:auto;padding:0;border:0;border-radius:16px;overflow:hidden;background:#faf8f5;box-shadow:0 24px 64px rgba(0,0,0,.3)}
.engenty-wizard-dialog::backdrop{background:rgba(20,18,16,.5)}
.engenty-wizard-dialog iframe{display:block;width:100%;height:100%;border:0}
.engenty-wizard-close{position:absolute;top:10px;right:10px;display:flex;align-items:center;justify-content:center;width:36px;height:36px;padding:0;border:0;border-radius:50%;color:#fff;background:rgba(20,18,16,.55);cursor:pointer}
@media (max-width:640px){.engenty-wizard-dialog{width:100vw;height:100dvh;border-radius:0}}`;
    document.head.append(style);
  }

  const button = document.createElement("button");
  button.type = "button";
  button.className = "engenty-wizard-button";
  button.textContent = label;
  script.after(button);

  let dialog = null;
  button.addEventListener("click", () => {
    // Built at the first click and kept: closed and opened again, the wizard is where it was.
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.className = "engenty-wizard-dialog";
      const el = frame();
      const close = document.createElement("button");
      close.type = "button";
      close.className = "engenty-wizard-close";
      close.setAttribute("aria-label", "Close");
      close.innerHTML =
        '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
      close.addEventListener("click", () => dialog.close());
      listen(el, "close", () => dialog.close());
      // A click beside the window lands on the dialog itself: its backdrop.
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) {
          dialog.close();
        }
      });
      dialog.addEventListener("close", () => {
        document.documentElement.style.overflow = dialog.dataset.overflow ?? "";
      });
      dialog.append(el, close);
      document.body.append(dialog);
    }
    // The page behind stays where it is while the window is open.
    dialog.dataset.overflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    dialog.showModal();
  });
})();
