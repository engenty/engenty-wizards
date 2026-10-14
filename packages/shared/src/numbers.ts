// SPDX-License-Identifier: FSL-1.1-MIT OR MIT

/**
 * Numbers as people write and read them: what a phone's number pad, a table cell or a document
 * gives, and a file's size as a list shows it. The server, the studio and the runner read and
 * show them the same way.
 */

/**
 * A number as people type and write it: `89,90` from a German number pad, `1.234,50`, `1,234.50`,
 * `20.000`, `1 234`. Where only one kind of mark is in it, a dot before groups of three digits
 * separates thousands (`1.234` is 1234) and a comma is the decimal point (`1,5`); several commas
 * between groups of three separate thousands (`1,234,567`). With `units`, what stands around the
 * number is dropped (`38 h`, `20.000 €`, `19 %`); without, anything but the number makes it none.
 * Null where there is no number.
 */
export function readNumber(value: unknown, opts: { units?: boolean } = {}): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") {
    return null;
  }
  let s = opts.units ? value.replace(/[^\d,.-]/g, "") : value.replace(/[\s'’]/g, "");
  if (!/^[-+]?[\d.,]*\d[\d.,]*$/.test(s)) {
    return null;
  }
  if (s.includes(",") && s.includes(".")) {
    s =
      s.lastIndexOf(",") > s.lastIndexOf(".")
        ? s.replace(/\./g, "").replace(",", ".")
        : s.replace(/,/g, "");
  } else if (s.includes(",")) {
    s = /^[-+]?\d{1,3}(,\d{3}){2,}$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (/^[-+]?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * A file's size for a list, in decimal units as the operating systems show them: `1 KB` for
 * anything below a kilobyte but nothing (`0 KB`), `340 KB`, `2.4 MB`, `1.2 GB`.
 */
export function formatBytes(bytes: number): string {
  if (!(bytes > 0)) {
    return "0 KB";
  }
  if (bytes < 999_500) {
    return `${Math.max(1, Math.round(bytes / 1000))} KB`;
  }
  if (bytes < 999_950_000) {
    return `${(bytes / 1_000_000).toFixed(1)} MB`;
  }
  return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
}
