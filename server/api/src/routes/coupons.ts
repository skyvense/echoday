import { Hono } from "hono";
import { z } from "zod";
import { requireUser, type AppEnv } from "../auth.js";
import { accessOf } from "../access.js";
import { redeemCoupon } from "../coupons.js";
import { findUserById } from "../db.js";
import { parseBody, rateLimit, readJson } from "../http.js";

const redeemSchema = z.object({
  code: z.string().trim().min(1).max(64),
});

export const couponRoutes = new Hono<AppEnv>();

couponRoutes.post("/redeem", requireUser(), async (c) => {
  const user = c.get("user");
  rateLimit(`coupon-redeem:${user.id}`, 20, 15 * 60 * 1000);
  const body = parseBody(redeemSchema, await readJson(c));
  const result = await redeemCoupon(user, body.code);
  const fresh = (await findUserById(user.id)) ?? user;
  return c.json({ ...result, billing: accessOf(fresh) });
});
