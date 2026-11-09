import assert from "node:assert/strict";
import test from "node:test";

process.env.JWT_SECRET ||= "unit-test-jwt-secret-16";
process.env.DATABASE_URL ||= "postgres://muse:muse@127.0.0.1:5432/muse";
process.env.PUBLIC_URL ||= "http://127.0.0.1:8080";
process.env.STORAGE_DRIVER ||= "fs";
process.env.ADMIN_EMAILS = "Ops@Example.com, second@example.com";

const NOW = new Date("2026-11-09T00:00:00.000Z");

function coupon(partial: Record<string, unknown> = {}) {
  return {
    disabled: false,
    expires_at: null,
    used_count: 0,
    max_uses: 1,
    ...partial,
  } as never;
}

test("coupon codes normalize to stored form", async () => {
  const { normalizeCouponCode, formatCouponCode } = await import("./coupons.js");
  assert.equal(normalizeCouponCode(" ab-cd 234 "), "ABCD234");
  assert.equal(normalizeCouponCode("wxyz-9876"), "WXYZ9876");
  assert.equal(normalizeCouponCode("---"), "");
  assert.equal(formatCouponCode("ABCD2345"), "ABCD-2345");
});

test("generated codes are 8 unambiguous characters", async () => {
  const { generateCouponCode } = await import("./coupons.js");
  for (let i = 0; i < 50; i++) {
    const code = generateCouponCode();
    assert.match(code, /^[A-Z2-9]{8}$/);
    assert.equal(/[01IOL]/.test(code), false);
  }
});

test("coupon rejection reasons follow the documented order", async () => {
  const { couponRejection } = await import("./coupons.js");
  assert.equal(couponRejection(null, false, NOW), "invalid");
  assert.equal(couponRejection(coupon({ disabled: true }), false, NOW), "disabled");
  assert.equal(
    couponRejection(coupon({ expires_at: new Date("2026-11-08T00:00:00Z") }), false, NOW),
    "expired",
  );
  // Already redeemed wins over exhausted: the user hears about their own
  // earlier redemption, not the global count.
  assert.equal(couponRejection(coupon({ used_count: 1, max_uses: 1 }), true, NOW), "already_redeemed");
  assert.equal(couponRejection(coupon({ used_count: 1, max_uses: 1 }), false, NOW), "exhausted");
  assert.equal(couponRejection(coupon({ used_count: 0, max_uses: 2 }), false, NOW), null);
  assert.equal(
    couponRejection(coupon({ expires_at: new Date("2026-12-01T00:00:00Z") }), false, NOW),
    null,
  );
});

test("redemption stacks on the latest of now, paid end, and open trial end", async () => {
  const { redemptionBase } = await import("./coupons.js");
  const base = {
    subscription_current_period_end: null,
    subscription_status: "trialing",
    trial_ends_at: new Date("2026-11-15T00:00:00Z"),
  } as never;
  // Trial still open: days stack after the trial, not after now.
  assert.equal(redemptionBase(base, NOW).toISOString(), "2026-11-15T00:00:00.000Z");
  const paid = {
    subscription_current_period_end: new Date("2027-01-01T00:00:00Z"),
    subscription_status: "active",
    trial_ends_at: new Date("2026-11-15T00:00:00Z"),
  } as never;
  assert.equal(redemptionBase(paid, NOW).toISOString(), "2027-01-01T00:00:00.000Z");
  const lapsed = {
    subscription_current_period_end: new Date("2026-01-01T00:00:00Z"),
    subscription_status: "canceled",
    trial_ends_at: new Date("2026-01-02T00:00:00Z"),
  } as never;
  assert.equal(redemptionBase(lapsed, NOW).toISOString(), NOW.toISOString());
});

test("admin emails match case-insensitively from ADMIN_EMAILS", async () => {
  const { isAdminEmail } = await import("./env.js");
  assert.equal(isAdminEmail("ops@example.com"), true);
  assert.equal(isAdminEmail("SECOND@example.com"), true);
  assert.equal(isAdminEmail("nobody@example.com"), false);
  assert.equal(isAdminEmail(""), false);
});

test("retention limits follow plan and processing state", async () => {
  const { retentionDue, retentionLimitDays } = await import("./retention.js");
  assert.equal(retentionLimitDays({ hasResult: true, paid: false }), 2);
  assert.equal(retentionLimitDays({ hasResult: true, paid: true }), 30);
  assert.equal(retentionLimitDays({ hasResult: false, paid: false }), 7);
  assert.equal(retentionLimitDays({ hasResult: false, paid: true }), 90);
  const day = 24 * 60 * 60 * 1000;
  const processed = { hasResult: true, paid: false, anchorAt: new Date(NOW.getTime() - 3 * day) };
  assert.equal(retentionDue(processed, NOW), true);
  assert.equal(retentionDue({ ...processed, anchorAt: new Date(NOW.getTime() - 1 * day) }, NOW), false);
  const fresh = { hasResult: false, paid: true, anchorAt: new Date(NOW.getTime() - 30 * day) };
  assert.equal(retentionDue(fresh, NOW), false);
});
