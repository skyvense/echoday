import type { UserRow } from "./db.js";
import { env, isAdminEmail } from "./env.js";

export interface Access {
  upload: boolean;
  mode: "trial" | "paid" | "read_only";
  reason: "trial" | "active" | "trial_ended" | "past_due" | "canceled";
  trialEndsAt: string;
  paidUntil: string | null;
  source: string | null;
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
    paidUntil: user.subscription_current_period_end
      ? new Date(user.subscription_current_period_end).toISOString()
      : null,
    source: user.subscription_source ?? null,
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
    is_admin: isAdminEmail(user.email),
    billing: access,
    public_url: env.publicUrl,
  };
}
