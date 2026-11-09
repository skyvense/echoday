import type { UserRow } from "./db.js";
import { env } from "./env.js";

export interface Access {
  upload: boolean;
  mode: "trial" | "paid" | "read_only";
  reason: "trial" | "active" | "trial_ended" | "past_due" | "canceled";
  trialEndsAt: string;
  status: string;
  priceCents: number;
  currency: string;
  provider: "stripe" | "stub";
  quotaBytes: number;
}

export function accessOf(user: UserRow): Access {
  const trialEndsAt = new Date(user.trial_ends_at).toISOString();
  const trialOpen = new Date(user.trial_ends_at).getTime() > Date.now();
  const base = {
    trialEndsAt,
    status: user.subscription_status,
    priceCents: env.priceCents,
    currency: env.currency,
    provider: env.billingMode,
  };

  if (user.subscription_status === "active") {
    return { ...base, upload: true, mode: "paid", reason: "active", quotaBytes: env.paidQuotaBytes };
  }
  if (user.subscription_status === "trialing" && trialOpen) {
    return { ...base, upload: true, mode: "trial", reason: "trial", quotaBytes: env.freeQuotaBytes };
  }
  if (user.subscription_status === "past_due") {
    return { ...base, upload: false, mode: "read_only", reason: "past_due", quotaBytes: env.paidQuotaBytes };
  }
  if (user.subscription_status === "canceled") {
    return { ...base, upload: false, mode: "read_only", reason: "canceled", quotaBytes: env.freeQuotaBytes };
  }
  return { ...base, upload: false, mode: "read_only", reason: "trial_ended", quotaBytes: env.freeQuotaBytes };
}

export function publicUser(user: UserRow) {
  const access = accessOf(user);
  return {
    id: user.id,
    email: user.email,
    created_at: new Date(user.created_at).toISOString(),
    billing: access,
    public_url: env.publicUrl,
  };
}
