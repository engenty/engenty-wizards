import { createHash, randomBytes } from "node:crypto";
import { seal, unseal } from "../crypto.js";
import { env } from "../env.js";
import { discovery, type TokenSet, tokenRequest, unverifiedClaims } from "../manage.js";
import { deleteSetting, readSetting, writeSetting } from "../settings.js";
import { vaultDelete, vaultGet, vaultSet } from "../vault.js";

/**
 * The account a runtime that runs alone is linked to: sign-in (or sign-up) happens in the system
 * browser at the Manage-App, the code comes back to this server on the loopback interface. The
 * account is optional; it unlocks credits through the gateway and publishing to the cloud.
 */
const CLIENT = { id: "wizards-desktop" };
const REFRESH = "account.refresh";
const SCOPE = "openid profile email offline_access wizards:read wizards:write wizards:publish";

export interface LinkedAccount {
  userId: string;
  tenantId: string;
  name: string;
  email: string;
}

interface LinkState {
  verifier: string;
  redirect: string;
  exp: number;
}

/** Loopback redirect on the port this server listens on (RFC 8252). */
function redirectUri(): string {
  return `http://127.0.0.1:${env.port}/api/auth/callback`;
}

export async function startLink(): Promise<string> {
  const d = await discovery(env.local.accountUrl);
  const verifier = randomBytes(32).toString("base64url");
  const state: LinkState = { verifier, redirect: redirectUri(), exp: Date.now() + 15 * 60_000 };
  const url = new URL(d.authorization_endpoint);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT.id,
    redirect_uri: state.redirect,
    scope: SCOPE,
    resource: env.local.cloudUrl,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    state: seal(state),
  }).toString();
  return url.toString();
}

let cached: { token: string; expiresAt: number } | null = null;

async function keep(tokens: TokenSet): Promise<LinkedAccount> {
  const claims = unverifiedClaims(tokens.access_token);
  if (!claims) {
    throw new Error("The account's token names no tenant.");
  }
  if (tokens.refresh_token) {
    await vaultSet(REFRESH, tokens.refresh_token);
  }
  cached = {
    token: tokens.access_token,
    expiresAt: Date.now() + (tokens.expires_in ?? 600) * 1000,
  };
  const account: LinkedAccount = {
    userId: claims.userId,
    tenantId: claims.tenantId,
    name: claims.name,
    email: claims.email,
  };
  await writeSetting("account", account);
  return account;
}

export async function finishLink(code: string, rawState: string): Promise<LinkedAccount> {
  const state = unseal<LinkState>(rawState);
  if (!state || state.exp < Date.now()) {
    throw new Error("This sign-in has expired.");
  }
  const tokens = await tokenRequest(
    {
      grant_type: "authorization_code",
      code,
      redirect_uri: state.redirect,
      code_verifier: state.verifier,
      resource: env.local.cloudUrl,
    },
    CLIENT,
    env.local.accountUrl,
  );
  return keep(tokens);
}

export function linkedAccount(): Promise<LinkedAccount | null> {
  return readSetting<LinkedAccount>("account");
}

/** A fresh access token of the linked account, or null when none is linked (or it was revoked). */
export async function accountToken(): Promise<string | null> {
  if (cached && cached.expiresAt - Date.now() > 60_000) {
    return cached.token;
  }
  const refresh = await vaultGet(REFRESH);
  if (!refresh) {
    return null;
  }
  try {
    const tokens = await tokenRequest(
      { grant_type: "refresh_token", refresh_token: refresh, resource: env.local.cloudUrl },
      CLIENT,
      env.local.accountUrl,
    );
    await keep(tokens);
    return tokens.access_token;
  } catch {
    return null;
  }
}

export async function unlink(): Promise<void> {
  const refresh = await vaultGet(REFRESH);
  if (refresh) {
    const d = await discovery(env.local.accountUrl).catch(() => null);
    if (d?.revocation_endpoint) {
      await fetch(d.revocation_endpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: refresh, client_id: CLIENT.id }),
        signal: AbortSignal.timeout(10_000),
      }).catch(() => undefined);
    }
  }
  cached = null;
  await vaultDelete(REFRESH);
  await deleteSetting("account");
}

/** Balance and tenants of the linked account, straight from the Manage-App. */
export async function accountOverview(): Promise<{
  user: { id: string; name: string; email: string; image?: string | null };
  tenant: { id: string; name: string; role: string; balanceCredits: number };
} | null> {
  const token = await accountToken();
  if (!token) {
    return null;
  }
  const res = await fetch(`${env.local.accountUrl}/v1/me`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  return res?.ok ? ((await res.json()) as never) : null;
}
