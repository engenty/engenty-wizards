import { eq } from "drizzle-orm";
import { Hono } from "hono";
import Stripe from "stripe";
import { z } from "zod";
import type { SessionUser } from "../auth.js";
import { db, schema } from "../db/client.js";
import { env } from "../env.js";
import { getBilling, grantTopup, setPlan } from "./credits.js";

const stripe = env.stripe.secret ? new Stripe(env.stripe.secret) : null;

export function billingEnabled(): boolean {
  return Boolean(stripe && env.stripe.pricePro);
}

async function customerFor(user: SessionUser): Promise<string> {
  const b = await getBilling(user.id);
  if (b.stripeCustomerId) {
    return b.stripeCustomerId;
  }
  const customer = await stripe!.customers.create({
    email: user.email,
    name: user.name,
    metadata: { userId: user.id },
  });
  await db
    .update(schema.billing)
    .set({ stripeCustomerId: customer.id })
    .where(eq(schema.billing.userId, user.id));
  return customer.id;
}

export const billingRoutes = new Hono<{ Variables: { user: SessionUser } }>()
  .post("/checkout", async (c) => {
    if (!billingEnabled()) {
      return c.json({ error: "Bezahlung ist auf diesem Server nicht eingerichtet." }, 501);
    }
    const user = c.get("user");
    const { kind } = z.object({ kind: z.enum(["pro", "topup"]) }).parse(await c.req.json());
    if (kind === "topup" && !env.stripe.priceTopup) {
      return c.json({ error: "Guthaben-Pakete sind nicht eingerichtet." }, 501);
    }
    const session = await stripe!.checkout.sessions.create({
      mode: kind === "pro" ? "subscription" : "payment",
      customer: await customerFor(user),
      client_reference_id: user.id,
      line_items: [
        { price: kind === "pro" ? env.stripe.pricePro : env.stripe.priceTopup, quantity: 1 },
      ],
      metadata: { userId: user.id, kind },
      ...(kind === "pro" ? { subscription_data: { metadata: { userId: user.id } } } : {}),
      allow_promotion_codes: true,
      success_url: `${env.appUrl}/billing?ok=1`,
      cancel_url: `${env.appUrl}/billing`,
    });
    return c.json({ url: session.url });
  })
  .post("/portal", async (c) => {
    if (!stripe) {
      return c.json({ error: "Bezahlung ist auf diesem Server nicht eingerichtet." }, 501);
    }
    const user = c.get("user");
    const portal = await stripe.billingPortal.sessions.create({
      customer: await customerFor(user),
      return_url: `${env.appUrl}/billing`,
    });
    return c.json({ url: portal.url });
  });

/** Stripe → us. Mounted outside the session guard; trusts only a valid signature. */
export const stripeWebhook = new Hono().post("/", async (c) => {
  if (!stripe || !env.stripe.webhookSecret) {
    return c.json({ error: "not configured" }, 501);
  }
  const raw = await c.req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      raw,
      c.req.header("stripe-signature") ?? "",
      env.stripe.webhookSecret,
    );
  } catch {
    return c.json({ error: "bad signature" }, 400);
  }
  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object;
      const userId = s.metadata?.userId ?? s.client_reference_id;
      if (!userId) {
        break;
      }
      if (s.metadata?.kind === "topup" && s.payment_status === "paid") {
        await grantTopup(userId, env.credits.topup, `stripe ${s.id}`);
      } else if (s.metadata?.kind === "pro") {
        await setPlan(userId, "pro", {
          customerId: typeof s.customer === "string" ? s.customer : (s.customer?.id ?? null),
          subscriptionId:
            typeof s.subscription === "string" ? s.subscription : (s.subscription?.id ?? null),
        });
      }
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const userId = sub.metadata?.userId;
      if (!userId) {
        break;
      }
      const active =
        event.type === "customer.subscription.updated" &&
        ["active", "trialing", "past_due"].includes(sub.status);
      await setPlan(userId, active ? "pro" : "free", { subscriptionId: active ? sub.id : null });
      break;
    }
  }
  return c.json({ received: true });
});
