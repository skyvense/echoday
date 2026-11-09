import { randomInt } from "node:crypto";
import { sql, type UserRow } from "./db.js";
import { HttpError } from "./http.js";

export interface CouponRow {
  id: string;
  code: string;
  kind: "days" | "lifetime";
  days: number | null;
  max_uses: number;
  used_count: number;
  expires_at: Date | null;
  disabled: boolean;
  note: string | null;
  created_at: Date;
}

export type CouponErrorCode = "invalid" | "expired" | "exhausted" | "already_redeemed" | "disabled";

/** Codes are stored uppercase with no separators; user input is forgiven. */
export function normalizeCouponCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// No 0/O/1/I/L: the code gets read aloud and typed on a phone keyboard.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateCouponCode(): string {
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

/** Display form only; the stored code has no dash. */
export function formatCouponCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

/**
 * Why a coupon cannot be redeemed right now, or null when it can.
 * Check order matters for the message the user sees: a code they already
 * used reports already_redeemed even if it has since been exhausted.
 */
export function couponRejection(
  coupon: Pick<CouponRow, "disabled" | "expires_at" | "used_count" | "max_uses"> | null,
  alreadyRedeemed: boolean,
  now: Date,
): CouponErrorCode | null {
  if (!coupon) return "invalid";
  if (coupon.disabled) return "disabled";
  if (coupon.expires_at && new Date(coupon.expires_at).getTime() <= now.getTime()) return "expired";
  if (alreadyRedeemed) return "already_redeemed";
  if (coupon.used_count >= coupon.max_uses) return "exhausted";
  return null;
}

const COUPON_MESSAGES: Record<CouponErrorCode, string> = {
  invalid: "That coupon code does not exist.",
  expired: "That coupon code has expired.",
  exhausted: "That coupon code has no redemptions left.",
  already_redeemed: "You have already redeemed this coupon code.",
  disabled: "That coupon code is no longer active.",
};

export const LIFETIME_UNTIL = new Date("2099-12-31T23:59:59.000Z");

/**
 * The instant a 'days' redemption starts counting from: the later of now,
 * the current paid period end, and (while still trialing) the trial end —
 * so a coupon never eats time the user already has.
 */
export function redemptionBase(user: UserRow, now: Date): Date {
  let base = now.getTime();
  if (user.subscription_current_period_end) {
    base = Math.max(base, new Date(user.subscription_current_period_end).getTime());
  }
  if (user.subscription_status === "trialing" && user.trial_ends_at) {
    base = Math.max(base, new Date(user.trial_ends_at).getTime());
  }
  return new Date(base);
}

export interface RedemptionResult {
  code: string;
  kind: "days" | "lifetime";
  paid_until: string;
  mode: "paid";
  source: "coupon";
}

/**
 * Redeem a code for a user. Runs in one transaction with the coupon row
 * locked (SELECT … FOR UPDATE), so two concurrent redemptions of the last
 * remaining use cannot both succeed; the (coupon_id, user_id) unique
 * constraint is the backstop for double-redemption.
 */
export async function redeemCoupon(user: UserRow, rawCode: string): Promise<RedemptionResult> {
  const code = normalizeCouponCode(rawCode);
  if (!code) {
    throw new HttpError(400, "invalid", COUPON_MESSAGES.invalid);
  }
  const now = new Date();
  return sql.begin(async (trx) => {
    const coupons = await trx<CouponRow[]>`
      select * from coupons where code = ${code} for update
    `;
    const coupon = coupons[0] ?? null;
    let alreadyRedeemed = false;
    if (coupon) {
      const prior = await trx<{ id: string }[]>`
        select id from coupon_redemptions where coupon_id = ${coupon.id} and user_id = ${user.id}
      `;
      alreadyRedeemed = prior.length > 0;
    }
    const rejection = couponRejection(coupon, alreadyRedeemed, now);
    if (!coupon || rejection) {
      throw new HttpError(400, rejection ?? "invalid", COUPON_MESSAGES[rejection ?? "invalid"]);
    }

    let paidUntil: Date;
    if (coupon.kind === "lifetime") {
      paidUntil = LIFETIME_UNTIL;
    } else {
      paidUntil = new Date(redemptionBase(user, now).getTime() + (coupon.days ?? 0) * 24 * 60 * 60 * 1000);
    }

    await trx`update coupons set used_count = used_count + 1 where id = ${coupon.id}`;
    await trx`
      insert into coupon_redemptions (coupon_id, user_id) values (${coupon.id}, ${user.id})
    `;
    await trx`
      update users set
        subscription_status = 'active',
        subscription_current_period_end = ${paidUntil},
        subscription_source = 'coupon'
      where id = ${user.id}
    `;
    return {
      code: coupon.code,
      kind: coupon.kind,
      paid_until: paidUntil.toISOString(),
      mode: "paid" as const,
      source: "coupon" as const,
    };
  });
}

export function shapeCoupon(coupon: CouponRow & { redemption_count?: number }) {
  return {
    id: coupon.id,
    code: coupon.code,
    code_display: formatCouponCode(coupon.code),
    kind: coupon.kind,
    days: coupon.days,
    max_uses: coupon.max_uses,
    used_count: coupon.used_count,
    expires_at: coupon.expires_at ? new Date(coupon.expires_at).toISOString() : null,
    disabled: coupon.disabled,
    note: coupon.note,
    created_at: new Date(coupon.created_at).toISOString(),
  };
}
