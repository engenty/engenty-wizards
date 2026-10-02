import { useQuery } from "@tanstack/react-query";
import { Eye, FlaskConical, Globe, KeyRound, PencilLine, UserRound } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Mascot } from "../brand";
import { api } from "../lib/api";
import { t } from "../lib/i18n";
import { useMe } from "../lib/session";
import { SignInPage } from "../studio/SignInPage";
import { Button, Spinner } from "../ui";

/** Parameters the server adds when it signs the authorization request for our pages. */
const SIGNED_ONLY = ["sig", "exp", "ba_iat", "ba_pl", "ba_param"];

/** Back to the authorization endpoint with the original request, now with a session. */
function continueAuthorize() {
  const query = new URLSearchParams(window.location.search);
  for (const key of SIGNED_ONLY) {
    query.delete(key);
  }
  // The admin just signed in, which is what prompt=login asks for.
  if (query.get("prompt") === "login") {
    query.delete("prompt");
  }
  window.location.replace(`/api/auth/oauth2/authorize?${query}`);
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 py-16">{children}</div>
  );
}

/** `loginPage` of the OAuth server: sign in, then the authorization request goes on. */
export function OAuthSignInPage() {
  const me = useMe();
  useEffect(() => {
    if (me.data) {
      continueAuthorize();
    }
  }, [me.data]);
  if (me.isLoading || me.data) {
    return (
      <Centered>
        <Spinner />
      </Centered>
    );
  }
  return (
    <SignInPage
      title={t("oauth.signInTitle")}
      sub={t("oauth.signInSub")}
      callbackURL={window.location.pathname + window.location.search}
      onSignedIn={continueAuthorize}
    />
  );
}

const SCOPE_LINES: { scopes: string[]; icon: ReactNode; label: () => string }[] = [
  { scopes: ["wizards:read"], icon: <Eye className="size-4" />, label: () => t("oauth.scopeRead") },
  {
    scopes: ["wizards:write"],
    icon: <PencilLine className="size-4" />,
    label: () => t("oauth.scopeWrite"),
  },
  {
    scopes: ["wizards:publish"],
    icon: <Globe className="size-4" />,
    label: () => t("oauth.scopePublish"),
  },
  {
    scopes: ["runs:test"],
    icon: <FlaskConical className="size-4" />,
    label: () => t("oauth.scopeTest"),
  },
  {
    scopes: ["openid", "profile", "email"],
    icon: <UserRound className="size-4" />,
    label: () => t("oauth.scopeProfile"),
  },
  {
    scopes: ["offline_access"],
    icon: <KeyRound className="size-4" />,
    label: () => t("oauth.scopeOffline"),
  },
];

interface PublicClient {
  client_id: string;
  client_name?: string;
  client_uri?: string;
}

/** `consentPage` of the OAuth server: the admin allows or denies an MCP client. */
export function ConsentPage() {
  const me = useMe();
  const params = new URLSearchParams(window.location.search);
  const clientId = params.get("client_id") ?? "";
  const requested = new Set((params.get("scope") ?? "").split(" ").filter(Boolean));
  const client = useQuery({
    queryKey: ["oauth-client", clientId],
    queryFn: () =>
      api.get<PublicClient>(
        `/api/auth/oauth2/public-client?client_id=${encodeURIComponent(clientId)}`,
      ),
    enabled: Boolean(me.data && clientId),
  });
  const [busy, setBusy] = useState<"allow" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (me.isLoading) {
    return (
      <Centered>
        <Spinner />
      </Centered>
    );
  }
  if (!me.data) {
    return (
      <SignInPage
        title={t("oauth.signInTitle")}
        sub={t("oauth.signInSub")}
        callbackURL={window.location.pathname + window.location.search}
        onSignedIn={() => window.location.reload()}
      />
    );
  }

  const decide = async (accept: boolean) => {
    setBusy(accept ? "allow" : "deny");
    setError(null);
    try {
      const res = await api.post<{ url?: string; redirect_uri?: string }>(
        "/api/auth/oauth2/consent",
        { accept, oauth_query: window.location.search.slice(1) },
      );
      const next = res.url ?? res.redirect_uri;
      if (next) {
        window.location.href = next;
        return;
      }
      setError(t("oauth.failed"));
    } catch (err) {
      setError((err as Error).message || t("oauth.failed"));
    }
    setBusy(null);
  };

  const name = client.data?.client_name || t("oauth.unknownClient");
  const host = (() => {
    try {
      return client.data?.client_uri ? new URL(client.data.client_uri).host : null;
    } catch {
      return null;
    }
  })();
  const lines = SCOPE_LINES.filter((l) => l.scopes.some((s) => requested.has(s)));

  return (
    <Centered>
      <div className="flex w-full max-w-md animate-rise flex-col items-center text-center">
        <Mascot kind="round" size={96} />
        <h1 className="mt-6 font-display font-semibold text-[28px] leading-tight tracking-tight">
          {t("oauth.consentTitle", { client: name })}
        </h1>
        <p className="mt-3 text-[15px] text-ink-3">
          {host ? `${host} · ` : ""}
          {t("oauth.signedInAs", { who: me.data.user.email })}
        </p>
        <ul className="mt-8 flex w-full flex-col gap-2 text-left">
          {lines.map((l) => (
            <li
              key={l.scopes[0]}
              className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3 text-[15px] ring-1 ring-border-soft"
            >
              <span className="text-ember">{l.icon}</span>
              {l.label()}
            </li>
          ))}
        </ul>
        {error ? <p className="mt-4 text-[14px] text-rose">{error}</p> : null}
        <div className="mt-8 flex w-full gap-3">
          <Button
            variant="secondary"
            size="lg"
            className="flex-1"
            busy={busy === "deny"}
            disabled={busy !== null}
            onClick={() => decide(false)}
          >
            {t("oauth.deny")}
          </Button>
          <Button
            size="lg"
            className="flex-1"
            busy={busy === "allow"}
            disabled={busy !== null || !clientId}
            onClick={() => decide(true)}
          >
            {t("oauth.allow")}
          </Button>
        </div>
        <p className="mt-6 text-[13px] text-ink-3">{t("oauth.revokeHint")}</p>
      </div>
    </Centered>
  );
}
