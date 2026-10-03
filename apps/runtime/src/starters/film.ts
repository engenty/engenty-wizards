import { AI_LABEL_GENERATED, AI_LABEL_MODIFIED } from "./ai-labels.js";

/**
 * The film widget the video starters share: scenes (clips or stills) on a canvas, captions, a
 * closing card with the call to action, and the sound that goes with it. A starter adds its own
 * entry page, which turns the run's data into scenes and calls `Film.play`.
 */

const FILM_JS = String.raw`(function () {
  var W = window.wizard;
  function clamp(x, a, b) { return Math.min(b === undefined ? 1 : b, Math.max(a === undefined ? 0 : a, x)); }
  function ease(x) { return 1 - Math.pow(1 - clamp(x), 3); }
  function isUrl(s) { return /^(https?:|data:|blob:)/.test(s); }
  function srcOf(s) { return s ? (isUrl(s) ? s : W.url(s)) : ""; }
  function isVideo(s) { return /^data:video\//.test(s) || /\.(mp4|webm|mov)([?#].*)?$/i.test(s); }
  function el(tag, cls, parent) { var e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; }

  function loadImage(src) {
    return new Promise(function (res) {
      if (!src) return res(null);
      var i = new Image();
      i.onload = function () { res(i); };
      i.onerror = function () { res(null); };
      i.src = src;
    });
  }
  function loadVideo(src) {
    return new Promise(function (res) {
      var v = document.createElement("video");
      var done = false;
      function finish(ok) { if (!done) { done = true; res(ok ? v : null); } }
      v.muted = true; v.playsInline = true; v.preload = "auto";
      v.addEventListener("loadeddata", function () { finish(true); });
      v.addEventListener("error", function () { finish(false); });
      setTimeout(function () { finish(v.readyState >= 2); }, 20000);
      v.src = src; v.load();
    });
  }
  function audioSeconds(src) {
    return new Promise(function (res) {
      if (!src) return res(0);
      var a = document.createElement("audio");
      var done = false;
      function finish(s) { if (!done) { done = true; res(s); } }
      a.preload = "metadata";
      a.addEventListener("loadedmetadata", function () { finish(isFinite(a.duration) ? a.duration : 0); });
      a.addEventListener("error", function () { finish(0); });
      setTimeout(function () { finish(0); }, 15000);
      a.src = src;
    });
  }
  function seekVideo(v, t) {
    return new Promise(function (res) {
      var target = clamp(t, 0, Math.max(0, v.duration - 0.06));
      if (Math.abs(v.currentTime - target) < 0.004 && v.readyState >= 2) return res();
      var done = false;
      function fin() { if (!done) { done = true; v.removeEventListener("seeked", fin); res(); } }
      v.addEventListener("seeked", fin);
      setTimeout(fin, 3000);
      v.currentTime = target;
    });
  }

  /**
   * Film.play({ size, style, scenes, hook, end, voice, label, clipSeconds, stillSeconds })
   *   style   "ad" (bold centred captions, word by word) | "tour" (a calm label bottom left)
   *   scenes  [{ media, fallback?, caption?, sub? }] — media is a clip or an image
   *   end     { title, lines?, cta?, note? } — the closing card
   *   voice   the voice-over, spoken from the start
   *   label   a small standing note ("virtuell möbliert")
   * Where the film shows media a model made or changed (wizard.ai), the EU's label for it stands
   * in the picture from the first frame to the last: "AI GENERATED" or "AI MODIFIED".
   */
  function play(o) {
    var size = o.size || { width: 1080, height: 1920 };
    var Wd = size.width, Hd = size.height, u = Wd / 100;
    var style = o.style || "ad";
    var accent = (W.brand && W.brand.accent) || o.accent || "#ff5a36";
    var root = document.getElementById("stage");
    root.className = "film film-" + style;
    root.style.width = Wd + "px"; root.style.height = Hd + "px";
    root.style.setProperty("--u", u + "px");
    root.style.setProperty("--accent", accent);
    var canvas = el("canvas", "film-canvas", root);
    canvas.width = Wd; canvas.height = Hd;
    var ctx = canvas.getContext("2d");
    var overlay = el("div", "film-overlay", root);

    function fit() {
      var s = Math.min(innerWidth / Wd, innerHeight / Hd) || 1;
      root.style.transform = W.mode === "export" ? "none" : "scale(" + s + ")";
    }
    addEventListener("resize", fit); fit();

    var input = (o.scenes || []).filter(function (s) { return s && (s.media || s.fallback); });
    var voiceSrc = srcOf(o.voice);
    // The EU label for what a model made or changed: one of the icon files in the workspace.
    var ai = o.ai === undefined ? W.ai : o.ai;
    var art = !ai ? null : ai === "edited"
      ? { file: "ai-modified.svg", box: 1700.79, x: 231.11, w: 1230.56 }
      : { file: "ai-generated.svg", box: 1789.84, x: 207.3, w: 1384.24 };

    Promise.all([
      Promise.all(input.map(function (s) {
        var src = srcOf(s.media), back = srcOf(s.fallback);
        var first = src && isVideo(src) ? loadVideo(src) : loadImage(src);
        return first.then(function (m) {
          // A clip that does not load is replaced by its still.
          return m ? m : loadImage(back);
        }).then(function (m) {
          return { media: m, video: !!(m && m.tagName === "VIDEO"), src: src, caption: s.caption || "", sub: s.sub || "" };
        });
      })),
      audioSeconds(voiceSrc),
      loadImage(W.brand && W.brand.logo),
      loadImage(art ? W.url(art.file) : "")
    ]).then(function (loaded) {
      var scenes = loaded[0].filter(function (s) { return s.media; });
      var voiceSeconds = loaded[1], logo = loaded[2], icon = loaded[3];
      var X = 0.4;
      var endSeconds = o.end ? 3.2 : 0;
      scenes.forEach(function (s) {
        s.seconds = s.video
          ? Math.min(s.media.duration || 4, o.clipSeconds || 8)
          : (o.stillSeconds || 3.4);
        s.clip = s.seconds;
      });
      var total = scenes.reduce(function (a, s) { return a + s.seconds; }, 0) + endSeconds;
      // The film is as long as what is said: stills stay longer, clips hold their last frame a
      // little, then the closing card stays.
      var needed = voiceSeconds ? 0.3 + voiceSeconds + 0.6 : 0;
      if (needed > total) {
        var extra = needed - total;
        [[function (s) { return !s.video; }, 3.5], [function (s) { return s.video; }, 2]].forEach(function (rule) {
          var some = scenes.filter(rule[0]);
          if (!some.length || extra <= 0) return;
          var each = Math.min(extra / some.length, rule[1]);
          some.forEach(function (s) { s.seconds += each; });
          extra -= each * some.length;
        });
        if (o.end && extra > 0) endSeconds += Math.min(extra, 4);
      }
      var at = 0;
      scenes.forEach(function (s) { s.start = at; at += s.seconds; });
      var endStart = at;
      var duration = endStart + endSeconds;

      // --- overlay: captions, hook, label, closing card ---
      scenes.forEach(function (s, i) {
        var box = el("div", "film-caption", overlay);
        if (style === "tour") {
          el("div", "film-caption-bar", box);
          var txt = el("div", "film-caption-text", box);
          el("div", "film-caption-title", txt).textContent = s.caption;
          if (s.sub) el("div", "film-caption-sub", txt).textContent = s.sub;
        } else {
          var line = el("div", "film-caption-words", box);
          s.words = String(s.caption).split(/\s+/).filter(Boolean).map(function (w) {
            var span = el("span", "film-word", line);
            span.textContent = w;
            line.appendChild(document.createTextNode(" "));
            return span;
          });
        }
        if (!s.caption) box.style.display = "none";
        s.box = box;
      });
      var hook = null;
      if (o.hook) { hook = el("div", "film-hook", overlay); el("span", "", hook).textContent = o.hook; }
      var label = null;
      if (o.label) { label = el("div", "film-label", overlay); label.textContent = o.label; }
      var card = null;
      if (o.end) {
        card = el("div", "film-end", overlay);
        if (logo) { var lg = el("img", "film-end-logo", card); lg.src = logo.src; }
        else if (W.brand && W.brand.name) el("div", "film-end-brand", card).textContent = W.brand.name;
        if (o.end.title) el("div", "film-end-title", card).textContent = o.end.title;
        (o.end.lines || []).filter(Boolean).forEach(function (l) { el("div", "film-end-line", card).textContent = l; });
        if (o.end.cta) { card.cta = el("div", "film-end-cta", card); card.cta.textContent = o.end.cta; }
        if (o.end.note) el("div", "film-end-note", card).textContent = o.end.note;
      }
      // The EU label: the pill of the icon file, cut out of the clear space around it.
      if (art && icon) {
        var high = (style === "tour" ? 1.9 : 3.4) * u, k = high / 266.41;
        var pill = el("div", "film-ai", overlay);
        pill.style.height = high + "px";
        pill.style.width = art.w * k + "px";
        icon.style.width = art.box * k + "px";
        icon.style.height = 566.93 * k + "px";
        icon.style.left = -art.x * k + "px";
        icon.style.top = -144.36 * k + "px";
        pill.appendChild(icon);
        // A note beside it stands clear of it.
        if (label && style === "tour") label.style.right = 3 * u + art.w * k + 1.4 * u + "px";
      }

      function cover(m, zoom, px, py, alpha) {
        var mw = m.videoWidth || m.naturalWidth || Wd, mh = m.videoHeight || m.naturalHeight || Hd;
        var s = Math.max(Wd / mw, Hd / mh) * zoom;
        var w = mw * s, h = mh * s;
        ctx.globalAlpha = alpha;
        ctx.drawImage(m, (Wd - w) / 2 + px * (w - Wd) / 2, (Hd - h) / 2 + py * (h - Hd) / 2, w, h);
        ctx.globalAlpha = 1;
      }
      function drawScene(i, local, alpha) {
        var s = scenes[i];
        var p = clamp(local / s.seconds);
        if (s.video) {
          // Past its end a clip holds the last frame and keeps moving in, barely.
          var held = Math.max(0, local - s.clip);
          return seekVideo(s.media, Math.max(0, Math.min(local, s.clip))).then(function () {
            cover(s.media, 1 + 0.012 * held, 0, 0, alpha);
          });
        }
        // A still moves a little: a slow push in, drifting to alternating sides.
        var dir = i % 2 ? 1 : -1;
        cover(s.media, 1.05 + 0.09 * p, dir * (0.5 - p) * 0.8, 0, alpha);
        return Promise.resolve();
      }
      function shade(from, strength) {
        var g = ctx.createLinearGradient(0, Hd * from, 0, Hd);
        g.addColorStop(0, "rgba(0,0,0,0)");
        g.addColorStop(1, "rgba(0,0,0," + strength + ")");
        ctx.fillStyle = g; ctx.fillRect(0, Hd * from, Wd, Hd * (1 - from));
      }

      function seek(t) {
        t = clamp(t, 0, duration);
        var i = scenes.length - 1;
        for (var k = 0; k < scenes.length; k++) { if (t < scenes[k].start + scenes[k].seconds) { i = k; break; } }
        var s = scenes[i];
        var inEnd = !!card && t >= endStart;
        var local = inEnd ? s.seconds - 0.02 : t - s.start;
        ctx.fillStyle = "#000"; ctx.fillRect(0, 0, Wd, Hd);
        return drawScene(i, local, 1).then(function () {
          var left = s.start + s.seconds - t;
          if (!inEnd && i < scenes.length - 1 && left < X) return drawScene(i + 1, 0, 1 - left / X);
        }).then(function () {
          shade(style === "tour" ? 0.6 : 0.45, style === "tour" ? 0.6 : 0.5);
          if (inEnd) {
            ctx.fillStyle = "rgba(12,14,22," + (0.78 * ease((t - endStart) / 0.5)) + ")";
            ctx.fillRect(0, 0, Wd, Hd);
          }
          scenes.forEach(function (sc, k) {
            var lt = t - sc.start;
            var on = !inEnd && k === i;
            var a = on ? Math.min(ease(lt / 0.3), ease((sc.seconds - lt) / 0.25)) : 0;
            sc.box.style.opacity = a;
            sc.box.style.transform = "translateY(" + (1 - a) * 2 * u + "px)";
            if (sc.words) {
              var step = Math.min(0.2, (sc.seconds * 0.55) / Math.max(1, sc.words.length));
              sc.words.forEach(function (w, n) {
                var wa = on ? ease((lt - 0.12 - n * step) / 0.16) : 0;
                w.style.opacity = wa;
                w.style.transform = "scale(" + (0.86 + 0.14 * wa) + ")";
              });
            }
          });
          if (hook) {
            var ha = i === 0 && !inEnd ? Math.min(ease(t / 0.35), ease((scenes[0].seconds - t) / 0.3)) : 0;
            hook.style.opacity = ha;
            hook.style.transform = "translateY(" + (ha - 1) * 3 * u + "px)";
          }
          if (label) label.style.opacity = inEnd ? 0.85 * (1 - ease((t - endStart) / 0.3)) : 0.85;
          if (card) {
            var ca = inEnd ? ease((t - endStart - 0.15) / 0.5) : 0;
            card.style.opacity = ca;
            card.style.transform = "translateY(" + (1 - ca) * 4 * u + "px)";
            if (card.cta) card.cta.style.transform = "scale(" + (1 + 0.035 * Math.sin((t - endStart) * 4.2)) + ")";
          }
        });
      }

      var audio = [];
      if (voiceSrc && voiceSeconds) audio.push({ src: voiceSrc, start: 0.3, volume: 1 });
      if (o.clipSound !== false) {
        scenes.forEach(function (s) {
          if (s.video) audio.push({ src: s.src, start: s.start, duration: s.clip, volume: voiceSeconds ? 0.16 : 0.85 });
        });
      }
      W.timeline({ duration: duration, seek: seek, poster: Math.min(1.2, duration / 2), audio: audio });

      seek(W.mode === "export" ? 0 : Math.min(1.2, duration / 2)).then(function () {
        W.ready();
        if (W.mode === "export") return;
        // In the browser the film simply plays, silent, and stops on a click.
        var playing = true, busy = false, t0 = performance.now(), offset = 0;
        root.addEventListener("click", function () {
          playing = !playing;
          if (playing) t0 = performance.now(); else offset = (offset + (performance.now() - t0) / 1000) % duration;
        });
        (function tick() {
          if (playing && !busy) {
            busy = true;
            seek((offset + (performance.now() - t0) / 1000) % duration).then(function () { busy = false; });
          }
          requestAnimationFrame(tick);
        })();
      });
    });
  }

  window.Film = { play: play };
})();
`;

const FILM_CSS = `html, body { margin: 0; background: #000; overflow: hidden; }
.film { position: relative; transform-origin: top left; overflow: hidden; font-family: Inter, "Helvetica Neue", Helvetica, Arial, sans-serif; color: #fff; }
.film-canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.film-overlay { position: absolute; inset: 0; }
.film-caption, .film-hook, .film-end, .film-label { position: absolute; opacity: 0; will-change: transform, opacity; }
.film-ai { position: absolute; overflow: hidden; border-radius: 999px; backdrop-filter: blur(calc(1.2 * var(--u))); -webkit-backdrop-filter: blur(calc(1.2 * var(--u))); }
.film-ai img { position: absolute; max-width: none; }
.film-ad .film-ai { left: calc(4 * var(--u)); top: calc(4.5 * var(--u)); }
.film-tour .film-ai { right: calc(3 * var(--u)); bottom: calc(2.4 * var(--u)); }

/* ad: bold words in the lower third, above where the platform puts its own buttons */
.film-ad .film-caption { left: calc(7 * var(--u)); right: calc(7 * var(--u)); top: 62%; text-align: center; }
.film-ad .film-caption-words { display: inline-block; padding: calc(2.2 * var(--u)) calc(3.4 * var(--u)); border-radius: calc(3 * var(--u)); background: rgba(10, 12, 20, 0.58); font-weight: 800; font-size: calc(6.2 * var(--u)); line-height: 1.16; letter-spacing: -0.01em; text-wrap: balance; }
.film-word { display: inline-block; opacity: 0; }
.film-ad .film-hook { left: 0; right: 0; top: 11%; text-align: center; }
.film-ad .film-hook span { display: inline-block; max-width: 82%; padding: calc(1.6 * var(--u)) calc(3.2 * var(--u)); border-radius: 99px; background: var(--accent); font-weight: 800; font-size: calc(4.2 * var(--u)); line-height: 1.2; text-wrap: balance; }
.film-ad .film-label { left: calc(4 * var(--u)); bottom: calc(3 * var(--u)); font-size: calc(2.4 * var(--u)); letter-spacing: 0.04em; text-shadow: 0 1px 6px rgba(0,0,0,.6); }

/* tour: a calm label bottom left */
.film-tour .film-caption { left: calc(4.5 * var(--u)); bottom: calc(6 * var(--u)); right: 30%; display: flex; gap: calc(1.2 * var(--u)); align-items: stretch; }
.film-caption-bar { width: calc(0.45 * var(--u)); border-radius: 99px; background: var(--accent); }
.film-caption-title { font-weight: 700; font-size: calc(3.3 * var(--u)); line-height: 1.15; text-shadow: 0 2px 14px rgba(0,0,0,.55); }
.film-caption-sub { margin-top: calc(0.5 * var(--u)); font-weight: 500; font-size: calc(1.9 * var(--u)); line-height: 1.3; opacity: .92; text-shadow: 0 2px 12px rgba(0,0,0,.6); }
.film-tour .film-hook { left: calc(4.5 * var(--u)); top: calc(4.5 * var(--u)); }
.film-tour .film-hook span { display: inline-block; padding: calc(0.7 * var(--u)) calc(1.6 * var(--u)); border-radius: 99px; background: rgba(10,12,20,.55); font-weight: 600; font-size: calc(1.7 * var(--u)); letter-spacing: .02em; }
.film-tour .film-label { right: calc(3 * var(--u)); bottom: calc(2.4 * var(--u)); line-height: calc(1.9 * var(--u)); font-size: calc(1.2 * var(--u)); letter-spacing: 0.03em; text-shadow: 0 1px 6px rgba(0,0,0,.7); }

/* the closing card */
.film-end { inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 0 9%; }
.film-end-logo { max-width: 34%; max-height: 12%; object-fit: contain; margin-bottom: calc(4 * var(--u)); }
.film-end-brand { font-weight: 700; letter-spacing: .14em; text-transform: uppercase; opacity: .85; margin-bottom: calc(3 * var(--u)); }
.film-end-title { font-weight: 800; letter-spacing: -0.015em; line-height: 1.1; text-wrap: balance; }
.film-end-line { margin-top: calc(1.6 * var(--u)); opacity: .9; line-height: 1.3; text-wrap: balance; }
.film-end-cta { margin-top: calc(5 * var(--u)); padding: calc(2 * var(--u)) calc(5 * var(--u)); border-radius: 99px; background: var(--accent); font-weight: 800; box-shadow: 0 calc(1 * var(--u)) calc(4 * var(--u)) rgba(0,0,0,.35); }
.film-end-note { margin-top: calc(3 * var(--u)); opacity: .75; }
.film-ad .film-end-brand { font-size: calc(3 * var(--u)); }
.film-ad .film-end-title { font-size: calc(8 * var(--u)); }
.film-ad .film-end-line { font-size: calc(4 * var(--u)); }
.film-ad .film-end-cta { font-size: calc(4.6 * var(--u)); }
.film-ad .film-end-note { font-size: calc(2.8 * var(--u)); }
.film-tour .film-end-brand { font-size: calc(1.5 * var(--u)); }
.film-tour .film-end-title { font-size: calc(4.4 * var(--u)); }
.film-tour .film-end-line { font-size: calc(2.1 * var(--u)); }
.film-tour .film-end-cta { font-size: calc(2.2 * var(--u)); margin-top: calc(2.6 * var(--u)); padding: calc(1.1 * var(--u)) calc(2.8 * var(--u)); }
.film-tour .film-end-note { font-size: calc(1.5 * var(--u)); margin-top: calc(1.6 * var(--u)); }
`;

/** A placeholder picture for previews before any run: a soft gradient with a number. */
function sampleSvg(n: number, from: string, to: string, portrait: boolean): string {
  const [w, h] = portrait ? [1080, 1920] : [1920, 1080];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/><circle cx="${w * 0.72}" cy="${h * 0.3}" r="${w * 0.18}" fill="#fff" opacity=".12"/><text x="50%" y="52%" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="${w * 0.2}" fill="#fff" opacity=".35">${n}</text></svg>`;
}

const SAMPLE_COLOURS: [string, string][] = [
  ["#24476b", "#6fa3c7"],
  ["#5b3a6e", "#d08a8a"],
  ["#2f5d50", "#b9c98a"],
];

function entryHtml(script: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="film.css">
<script src="film.js"></script>
</head>
<body>
<div id="stage"></div>
<script>
${script.trim()}
</script>
</body>
</html>
`;
}

/** The workspace files of a film starter: the player, its entry page and sample data. */
export function filmFiles(input: {
  entry: string;
  script: string;
  sample: Record<string, unknown>;
  portrait: boolean;
}): Record<string, string> {
  const files: Record<string, string> = {
    "film/film.js": FILM_JS,
    "film/film.css": FILM_CSS,
    "film/ai-generated.svg": AI_LABEL_GENERATED,
    "film/ai-modified.svg": AI_LABEL_MODIFIED,
    [`film/${input.entry}.html`]: entryHtml(input.script),
    [`film/${input.entry}.sample.json`]: JSON.stringify(input.sample, null, 2),
  };
  for (const [i, [from, to]] of SAMPLE_COLOURS.entries()) {
    files[`film/sample-${i + 1}.svg`] = sampleSvg(i + 1, from, to, input.portrait);
  }
  return files;
}
