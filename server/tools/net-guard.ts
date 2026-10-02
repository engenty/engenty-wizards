import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const ALLOW_PRIVATE = process.env.ALLOW_PRIVATE_FETCH === "1";

function privateV4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

function privateV6(ip: string): boolean {
  const s = ip.toLowerCase();
  return (
    s === "::1" || s === "::" || s.startsWith("fc") || s.startsWith("fd") || s.startsWith("fe80")
  );
}

/** Agents may reach the public internet, never this server's own network. */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Not a valid URL: ${raw}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https URLs are allowed.");
  }
  if (ALLOW_PRIVATE) {
    return url;
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new Error("Private addresses are not reachable from a wizard.");
  }
  const addresses = isIP(host)
    ? [{ address: host, family: isIP(host) }]
    : await lookup(host, { all: true });
  for (const a of addresses) {
    if (a.family === 4 ? privateV4(a.address) : privateV6(a.address)) {
      throw new Error("Private addresses are not reachable from a wizard.");
    }
  }
  return url;
}

/** fetch that re-checks every redirect hop, so a public URL cannot bounce into the private network. */
export async function safeFetch(raw: string, init: RequestInit = {}): Promise<Response> {
  let url = await assertPublicUrl(raw);
  for (let hop = 0; hop < 6; hop++) {
    const res = await fetch(url, { ...init, redirect: "manual" });
    const location = res.headers.get("location");
    if (res.status < 300 || res.status >= 400 || !location) {
      return res;
    }
    url = await assertPublicUrl(new URL(location, url).toString());
  }
  throw new Error("Too many redirects.");
}
