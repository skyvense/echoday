import { Hono } from "hono";
import type Stripe from "stripe";
import { accessOf, publicUser } from "../access.js";
import { requireUser, type AppEnv } from "../auth.js";
import {
  activateStub,
  applyStripeSubscription,
  cancelStub,
  extendStubTrial,
  stripe,
  userIdForStripeCustomer,
} from "../billing.js";
import { findUserById, sql } from "../db.js";
import { env } from "../env.js";
import { HttpError } from "../http.js";

export const billingRoutes = new Hono<AppEnv>();

billingRoutes.get("/", requireUser(), (c) => {
  const user = c.get("user");
  return c.json({
    ...accessOf(user),
    email: user.email,
    stripe_customer: Boolean(user.stripe_customer_id && !user.stripe_customer_id.startsWith("stub_")),
    portal_available: env.billingMode === "stripe" && Boolean(user.stripe_customer_id),
    stub_active: user.subscription_status === "active" && env.billingMode === "stub",
  });
});

billingRoutes.post("/checkout", requireUser(), async (c) => {
  const user = c.get("user");
  if (env.billingMode === "stub") {
    return c.json({
      provider: "stub",
      message: "Stripe keys are not set. Activate a local test subscription to try the paid state.",
    });
  }
  const client = stripe();
  let customerId = user.stripe_customer_id;
  if (!customerId || customerId.startsWith("stub_")) {
    const customer = await client.customers.create({
      email: user.email,
      metadata: { user_id: user.id },
    });
    customerId = customer.id;
    await sql`update users set stripe_customer_id = ${customerId} where id = ${user.id}`;
  }
  const trialEnd = Math.floor(new Date(user.trial_ends_at).getTime() / 1000);
  const now = Math.floor(Date.now() / 1000);
  const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = {
    metadata: { user_id: user.id },
  };
  if (user.subscription_status === "trialing" && trialEnd > now + 48 * 60 * 60) {
    subscriptionData.trial_end = trialEnd;
  }
  const session = await client.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: user.id,
    line_items: [{ price: env.stripePriceId, quantity: 1 }],
    success_url: `${env.publicUrl}/billing?checkout=success`,
    cancel_url: `${env.publicUrl}/billing?checkout=cancel`,
    metadata: { user_id: user.id },
    subscription_data: subscriptionData,
  });
  return c.json({ provider: "stripe", url: session.url });
});

billingRoutes.post("/portal", requireUser(), async (c) => {
  const user = c.get("user");
  if (env.billingMode !== "stripe") {
    throw new HttpError(400, "stripe_required", "The customer portal is available once Stripe is configured.");
  }
  if (!user.stripe_customer_id || user.stripe_customer_id.startsWith("stub_")) {
    throw new HttpError(400, "no_customer", "Subscribe once before opening the billing portal.");
  }
  const portal = await stripe().billingPortal.sessions.create({
    customer: user.stripe_customer_id,
    return_url: `${env.publicUrl}/billing`,
  });
  return c.json({ url: portal.url });
});

billingRoutes.post("/stub/trial", requireUser(), async (c) => {
  const trialEnds = await extendStubTrial(c.get("user"));
  const user = await findUserById(c.get("user").id);
  return c.json({
    ...publicUser(user!),
    message: `Trial uploads run until ${trialEnds.toISOString()}. No card was charged.`,
  });
});

billingRoutes.post("/stub/activate", requireUser(), async (c) => {
  await activateStub(c.get("user"));
  const user = await findUserById(c.get("user").id);
  return c.json(publicUser(user!));
});

billingRoutes.post("/stub/cancel", requireUser(), async (c) => {
  await cancelStub(c.get("user"));
  const user = await findUserById(c.get("user").id);
  return c.json(publicUser(user!));
});

billingRoutes.post("/webhook", async (c) => {
  if (env.billingMode !== "stripe" || !env.stripeWebhookSecret) {
    throw new HttpError(404, "not_found", "Stripe webhooks are not configured");
  }
  const signature = c.req.header("stripe-signature");
  if (!signature) throw new HttpError(400, "bad_signature", "Missing Stripe signature");
  const raw = await c.req.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, signature, env.stripeWebhookSecret);
  } catch {
    throw new HttpError(400, "bad_signature", "Stripe signature check failed");
  }
  await handleEvent(event);
  return c.json({ received: true });
});

async function handleEvent(event: Stripe.Event): Promise<void> {
  const client = stripe();
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.client_reference_id || session.metadata?.user_id;
    const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
    const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
    if (userId && subscriptionId) {
      const sub = await client.subscriptions.retrieve(subscriptionId);
      await applyStripeSubscription(userId, customerId, sub);
    }
    return;
  }
  if (
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted" ||
    event.type === "customer.subscription.created"
  ) {
    const sub = event.data.object as Stripe.Subscription;
    const userId = sub.metadata?.user_id || (await userIdForStripeCustomer(customerIdOf(sub)));
    if (!userId) return;
    await applyStripeSubscription(userId, customerIdOf(sub), sub);
  }
}

function customerIdOf(sub: Stripe.Subscription): string {
  return typeof sub.customer === "string" ? sub.customer : sub.customer.id;
}
