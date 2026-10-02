import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db, schema } from "./db/client.js";
import { env } from "./env.js";
import { onFirstSignIn } from "./onboarding.js";

const socialProviders: Record<string, { clientId: string; clientSecret: string }> = {};
if (env.google.id) {
  socialProviders.google = { clientId: env.google.id, clientSecret: env.google.secret };
}
if (env.github.id) {
  socialProviders.github = { clientId: env.github.id, clientSecret: env.github.secret };
}
if (env.microsoft.id) {
  socialProviders.microsoft = { clientId: env.microsoft.id, clientSecret: env.microsoft.secret };
}

export const enabledProviders = Object.keys(socialProviders);

export const auth = betterAuth({
  baseURL: env.appUrl,
  basePath: "/api/auth",
  secret: env.authSecret,
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  socialProviders,
  // Passwords exist only for the local dev login; production signs in socially.
  emailAndPassword: { enabled: env.devLogin },
  trustedOrigins: env.production
    ? [env.appUrl]
    : [env.appUrl, "http://localhost:5181", "http://127.0.0.1:5181"],
  session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
  databaseHooks: {
    user: {
      create: {
        after: async (created) => {
          await onFirstSignIn(created.id, created.name);
        },
      },
    },
  },
});

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}

export async function sessionUser(headers: Headers): Promise<SessionUser | null> {
  const result = await auth.api.getSession({ headers });
  return result?.user ?? null;
}
