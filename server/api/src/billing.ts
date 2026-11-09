import Stripe from "stripe";
import { env } from "./env.js";
import { sql, type UserRow } from "./db.js";
import { HttpError } from "./http.js";

let stripeClient: Stripe | null = null;

export function stripe(): Stripe {
  if (env.billingMode !== "stripe") {
    throw new HttpError(503, "billing_unconfigured", "Stripe is not configured on this server");
  }
  if (!stripeClient) {
    stripeClient = new Stripe(env.stripeSecretKey);
  }
  return stripeClient;
}

function mapStatus(status: Stripe.Subscription.Status): string {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    default:
      return "past_due";
  }
}

function unixDate(seconds: number | null | undefined): Date | null {
  if (!seconds) return null;
  return new Date(seconds * 1000);
}

function periodEnd(sub: Stripe.Subscription): Date | null {
  const direct = (sub as Stripe.Subscription & { current_period_end?: number }).current_period_end;
  if (direct) return unixDate(direct);
  const item = sub.items?.data?.[0] as { current_period_end?: number } | undefined;
  return unixDate(item?.current_period_end);
}

export async function applyStripeSubscription(
  userId: string,
  customerId: string | null,
  sub: Stripe.Subscription,
): Promise<void> {
  const status = mapStatus(sub.status);
  const period = periodEnd(sub);
  const trialEnd = unixDate(sub.trial_end);
  await sql`
    update users set
      subscription_status = ${status},
      stripe_customer_id = coalesce(${customerId}, stripe_customer_id),
      stripe_subscription_id = ${sub.id},
      subscription_current_period_end = ${period},
      trial_ends_at = case
        when ${trialEnd}::timestamptz is not null then ${trialEnd}
        else trial_ends_at
      end
    where id = ${userId}::uuid
  `;
}

export async function userIdForStripeCustomer(customerId: string): Promise<string | null> {
  const rows = await sql<{ id: string }[]>`
    select id from users where stripe_customer_id = ${customerId}
  `;
  return rows[0]?.id ?? null;
}

export async function extendStubTrial(user: UserRow): Promise<Date> {
  if (env.billingMode !== "stub") {
    throw new HttpError(400, "stripe_required", "Trials are managed in Stripe when billing keys are set.");
  }
  if (user.subscription_status === "active") {
    throw new HttpError(400, "already_subscribed", "This account is already on the local $5 subscription.");
  }
  const currentEnd = new Date(user.trial_ends_at).getTime();
  const start = user.subscription_status === "trialing" && currentEnd > Date.now() ? currentEnd : Date.now();
  const trialEnds = new Date(start + env.trialDays * 24 * 60 * 60 * 1000);
  await sql`
    update users set
      subscription_status = 'trialing',
      trial_ends_at = ${trialEnds}
    where id = ${user.id}
  `;
  return trialEnds;
}

export async function activateStub(user: UserRow): Promise<void> {
  if (env.billingMode !== "stub") {
    throw new HttpError(400, "stripe_required", "This server uses Stripe. Subscribe from the billing page.");
  }
  const periodEnd = new Date(Date.now() + 32 * 24 * 60 * 60 * 1000);
  await sql`
    update users set
      subscription_status = 'active',
      stripe_customer_id = coalesce(stripe_customer_id, ${"stub_" + user.id}),
      stripe_subscription_id = ${"stub_sub_" + user.id},
      subscription_current_period_end = ${periodEnd}
    where id = ${user.id}
  `;
}

export async function cancelStub(user: UserRow): Promise<void> {
  if (env.billingMode !== "stub") {
    throw new HttpError(400, "stripe_required", "Manage the subscription in the Stripe customer portal.");
  }
  const trialOpen = new Date(user.trial_ends_at).getTime() > Date.now();
  const status = trialOpen ? "trialing" : "canceled";
  await sql`
    update users set subscription_status = ${status}
    where id = ${user.id}
  `;
}
