import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * A second way through the one-time link: a ticket signed with the data folder's secret, good
 * for a minute. Who can read that secret can already make the studio's cookie, so a ticket opens
 * nothing new — it lets the command line and the desktop app enter a runtime that already runs.
 */
const TTL_MS = 60_000;

const sign = (secret: string, expires: number) =>
  createHmac("sha256", secret).update(`local-enter.${expires}`).digest("hex");

export function mintLocalTicket(secret: string, now = Date.now()): string {
  const expires = now + TTL_MS;
  return `${expires}.${sign(secret, expires)}`;
}

/** When a ticket runs out, or null when it is not one of ours or already ran out. */
export function localTicketExpiry(secret: string, ticket: string, now = Date.now()): number | null {
  const [head, signature] = ticket.split(".");
  const expires = Number(head);
  if (!signature || !Number.isSafeInteger(expires) || expires <= now || expires > now + TTL_MS) {
    return null;
  }
  const given = Buffer.from(signature);
  const expected = Buffer.from(sign(secret, expires));
  return given.length === expected.length && timingSafeEqual(given, expected) ? expires : null;
}
