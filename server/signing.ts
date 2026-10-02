import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env.js";

/** The query the signature covers: everything but exp/sig, sorted, so parameter order never matters. */
function payload(url: URL, exp: string): string {
  const params = [...url.searchParams.entries()]
    .filter(([k]) => k !== "exp" && k !== "sig")
    .sort(([a], [b]) => a.localeCompare(b));
  return `${url.pathname}?${new URLSearchParams(params)}|${exp}`;
}

function sign(data: string): string {
  return createHmac("sha256", env.authSecret).update(data).digest("base64url");
}

/**
 * A link that opens one GET path without a session — for clients that have no studio cookie,
 * such as an MCP client handing a download to the admin.
 */
export function signedUrl(path: string, ttlSeconds = 3600): string {
  const url = new URL(path, env.appUrl);
  const exp = String(Math.floor(Date.now() / 1000) + ttlSeconds);
  url.searchParams.set("exp", exp);
  url.searchParams.set("sig", sign(payload(url, exp)));
  return url.toString();
}

export function verifySignedUrl(href: string): boolean {
  const url = new URL(href, env.appUrl);
  const exp = url.searchParams.get("exp");
  const sig = url.searchParams.get("sig");
  if (!exp || !sig || Number(exp) * 1000 < Date.now()) {
    return false;
  }
  const expected = Buffer.from(sign(payload(url, exp)));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
