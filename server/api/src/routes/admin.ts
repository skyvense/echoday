import { Hono } from "hono";
import { z } from "zod";
import { accessOf } from "../access.js";
import { newMuseToken, requireAdmin, SCOPES, type AppEnv } from "../auth.js";
import {
  generateCouponCode,
  normalizeCouponCode,
  shapeCoupon,
  type CouponRow,
} from "../coupons.js";
import { sql, type UserRow } from "../db.js";
import { isAdminEmail } from "../env.js";
import { HttpError, likeContains, parseBody, readJson } from "../http.js";
import { runRetention } from "../retention.js";
import { store } from "../storage.js";

export const adminRoutes = new Hono<AppEnv>();

adminRoutes.use("*", requireAdmin());

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function userIdParam(c: { req: { param(name: string): string } }): string {
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) throw new HttpError(404, "not_found", "User not found");
  return id;
}

function iso(value: Date | string | null): string | null {
  return value ? new Date(value).toISOString() : null;
}

interface AdminUserAgg {
  used_bytes: string | number;
  token_count: number;
  active_token_count: number;
  last_upload_at: Date | null;
}

async function userAgg(userId: string): Promise<AdminUserAgg> {
  const rows = await sql<AdminUserAgg[]>`
    select
      coalesce((select sum(bytes) from objects where user_id = ${userId}), 0) as used_bytes,
      (select count(*)::int from api_tokens where user_id = ${userId}) as token_count,
      (select count(*)::int from api_tokens where user_id = ${userId} and revoked_at is null) as active_token_count,
      (select max(uploaded_at) from objects where user_id = ${userId}) as last_upload_at
  `;
  return rows[0]!;
}

function shapeAdminUser(user: UserRow, agg: AdminUserAgg) {
  const access = accessOf(user);
  return {
    id: user.id,
    email: user.email,
    created_at: iso(user.created_at),
    is_admin: isAdminEmail(user.email),
    subscription_status: user.subscription_status,
    subscription_source: user.subscription_source ?? null,
    trial_ends_at: iso(user.trial_ends_at),
    paid_until: access.paidUntil,
    mode: access.mode,
    used_bytes: Number(agg.used_bytes),
    quota_bytes: access.quotaBytes,
    token_count: agg.token_count,
    active_token_count: agg.active_token_count,
    last_upload_at: iso(agg.last_upload_at),
  };
}

async function loadUser(id: string): Promise<UserRow> {
  const rows = await sql<UserRow[]>`select * from users where id = ${id}`;
  if (!rows[0]) throw new HttpError(404, "not_found", "User not found");
  return rows[0];
}

// ---------- users ----------

adminRoutes.get("/users", async (c) => {
  const q = (c.req.query("q") ?? "").trim().slice(0, 200);
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 25) || 25));
  const offset = Math.max(0, Number(c.req.query("offset") ?? 0) || 0);
  const pattern = likeContains(q);
  const totalRows = await sql<{ total: string }[]>`
    select count(*)::text as total from users
    where ${q} = '' or email ilike ${pattern} escape '\\'
  `;
  const users = await sql<UserRow[]>`
    select * from users
    where ${q} = '' or email ilike ${pattern} escape '\\'
    order by created_at desc
    limit ${limit} offset ${offset}
  `;
  const shaped = [];
  for (const user of users) {
    shaped.push(shapeAdminUser(user, await userAgg(user.id)));
  }
  return c.json({ users: shaped, total: Number(totalRows[0]?.total ?? 0), limit, offset });
});

adminRoutes.get("/users/:id", async (c) => {
  const id = userIdParam(c);
  const user = await loadUser(id);
  const agg = await userAgg(id);
  const days = await sql<
    {
      day: string;
      audio_count: number;
      snapshot_count: number;
      bytes: string | number;
      has_summary: boolean;
      originals_deleted_at: Date | null;
      updated_at: Date;
    }[]
  >`
    select
      to_char(d.day, 'YYYY-MM-DD') as day,
      (select count(*)::int from objects o where o.day_id = d.id and o.kind in ('segment', 'note')) as audio_count,
      (select count(*)::int from objects o where o.day_id = d.id and o.kind = 'snapshot') as snapshot_count,
      coalesce((select sum(bytes) from objects o where o.day_id = d.id), 0) as bytes,
      exists (select 1 from summaries s where s.day_id = d.id) as has_summary,
      d.originals_deleted_at,
      d.updated_at
    from days d
    where d.user_id = ${id}
    order by d.day desc
    limit 100
  `;
  const tokens = await sql<
    {
      id: string;
      name: string;
      token_prefix: string;
      scopes: string[];
      created_at: Date;
      last_used_at: Date | null;
      revoked_at: Date | null;
    }[]
  >`
    select id, name, token_prefix, scopes, created_at, last_used_at, revoked_at
    from api_tokens where user_id = ${id}
    order by created_at desc
  `;
  return c.json({
    user: shapeAdminUser(user, agg),
    days: days.map((row) => ({
      date: row.day,
      audio_count: row.audio_count,
      snapshot_count: row.snapshot_count,
      bytes: Number(row.bytes),
      has_summary: row.has_summary,
      originals_deleted_at: iso(row.originals_deleted_at),
      updated_at: iso(row.updated_at),
    })),
    tokens: tokens.map((row) => ({
      id: row.id,
      name: row.name,
      prefix: row.token_prefix,
      scopes: row.scopes,
      created_at: iso(row.created_at),
      last_used_at: iso(row.last_used_at),
      revoked_at: iso(row.revoked_at),
      status: row.revoked_at ? "revoked" : "active",
    })),
  });
});

adminRoutes.post("/users/:id/tokens/:tokenId/revoke", async (c) => {
  const id = userIdParam(c);
  const tokenId = c.req.param("tokenId");
  if (!UUID_RE.test(tokenId)) throw new HttpError(404, "not_found", "Token not found");
  await loadUser(id);
  const rows = await sql<{ id: string }[]>`
    update api_tokens set revoked_at = now()
    where id = ${tokenId}::uuid and user_id = ${id} and revoked_at is null
    returning id
  `;
  if (!rows[0]) throw new HttpError(404, "not_found", "Token not found or already revoked");
  return c.json({ ok: true });
});

adminRoutes.post("/users/:id/tokens/reset", async (c) => {
  const id = userIdParam(c);
  await loadUser(id);
  const minted = newMuseToken();
  const created = await sql.begin(async (trx) => {
    await trx`
      update api_tokens set revoked_at = now()
      where user_id = ${id} and revoked_at is null
    `;
    const rows = await trx<{ id: string; created_at: Date }[]>`
      insert into api_tokens (user_id, name, token_hash, token_prefix, scopes)
      values (${id}, ${"Admin reset"}, ${minted.hash}, ${minted.prefix}, ${[...SCOPES]})
      returning id, created_at
    `;
    return rows[0]!;
  });
  // The plaintext is returned exactly once, in this response. Only the
  // hash is stored; the admin page shows it to the operator to copy.
  return c.json({
    id: created.id,
    token: minted.raw,
    prefix: minted.prefix,
    scopes: [...SCOPES],
    created_at: iso(created.created_at),
    message: "All previous tokens for this user were revoked. Copy this token now; it will not be shown again.",
  });
});

adminRoutes.delete("/users/:id", async (c) => {
  const id = userIdParam(c);
  if (id === c.get("user").id) {
    throw new HttpError(400, "cannot_delete_self", "You cannot delete your own admin account.");
  }
  const user = await loadUser(id);
  // Remove the blobs first (uploaded objects + daily sheet images). The
  // database rows go with the user delete below (FK cascade covers days,
  // objects, markers, summaries, tokens, and coupon redemptions).
  const objects = await sql<{ storage_key: string }[]>`
    select storage_key from objects where user_id = ${user.id}
  `;
  const sheets = await sql<{ sheet_key: string }[]>`
    select sheet_key from summaries where user_id = ${user.id} and sheet_key is not null
  `;
  let blobsDeleted = 0;
  let blobsFailed = 0;
  for (const key of [...objects.map((row) => row.storage_key), ...sheets.map((row) => row.sheet_key)]) {
    try {
      await store.remove(key);
      blobsDeleted += 1;
    } catch (error) {
      blobsFailed += 1;
      console.error(`admin delete: could not remove blob ${key}`, error);
    }
  }
  await sql`delete from users where id = ${user.id}`;
  return c.json({ ok: true, email: user.email, blobs_deleted: blobsDeleted, blobs_failed: blobsFailed });
});

const subscriptionSchema = z.object({
  action: z.enum(["set", "clear"]),
  paid_until: z.string().datetime().nullable().optional(),
});

adminRoutes.post("/users/:id/subscription", async (c) => {
  const id = userIdParam(c);
  const user = await loadUser(id);
  const body = parseBody(subscriptionSchema, await readJson(c));
  if (body.action === "set") {
    if (!body.paid_until) {
      throw new HttpError(400, "invalid_body", "paid_until is required when action is 'set'");
    }
    const until = new Date(body.paid_until);
    await sql`
      update users set
        subscription_status = 'active',
        subscription_current_period_end = ${until},
        subscription_source = 'admin'
      where id = ${user.id}
    `;
    return c.json({ ok: true, paid_until: until.toISOString(), mode: "paid" });
  }
  // clear: drop the paid period and fall back to the trial/free logic —
  // still inside the trial window means trialing, otherwise canceled
  // (read-only, like an ended trial).
  const trialOpen = new Date(user.trial_ends_at).getTime() > Date.now();
  const status = trialOpen ? "trialing" : "canceled";
  await sql`
    update users set
      subscription_status = ${status},
      subscription_current_period_end = null,
      subscription_source = 'admin'
    where id = ${user.id}
  `;
  return c.json({ ok: true, paid_until: null, mode: trialOpen ? "trial" : "read_only" });
});

// ---------- coupons ----------

adminRoutes.get("/coupons", async (c) => {
  const rows = await sql<CouponRow[]>`
    select * from coupons order by created_at desc limit 200
  `;
  return c.json({ coupons: rows.map((row) => shapeCoupon(row)) });
});

const createCouponSchema = z.object({
  code: z.string().trim().max(64).optional(),
  kind: z.enum(["days", "lifetime"]),
  days: z.number().int().positive().max(3650).nullable().optional(),
  max_uses: z.number().int().positive().max(100000).default(1),
  expires_at: z.string().datetime().nullable().optional(),
  note: z.string().trim().max(200).nullable().optional(),
});

adminRoutes.post("/coupons", async (c) => {
  const body = parseBody(createCouponSchema, await readJson(c));
  if (body.kind === "days" && !body.days) {
    throw new HttpError(400, "invalid_body", "days is required for a 'days' coupon");
  }
  const code = body.code ? normalizeCouponCode(body.code) : generateCouponCode();
  if (code.length < 4) {
    throw new HttpError(400, "invalid_body", "code must be at least 4 letters or digits");
  }
  const existing = await sql<{ id: string }[]>`select id from coupons where code = ${code}`;
  if (existing[0]) throw new HttpError(409, "code_exists", "A coupon with this code already exists");
  const couponDays: number | null = body.kind === "days" ? (body.days ?? null) : null;
  const couponMaxUses: number = body.max_uses ?? 1;
  const couponExpires: Date | null = body.expires_at ? new Date(body.expires_at) : null;
  const couponNote: string | null = body.note ?? null;
  const rows = await sql<CouponRow[]>`
    insert into coupons (code, kind, days, max_uses, expires_at, note)
    values (${code}, ${body.kind}, ${couponDays}, ${couponMaxUses}, ${couponExpires}, ${couponNote})
    returning *
  `;
  return c.json(shapeCoupon(rows[0]!), 201);
});

adminRoutes.post("/coupons/:id/disable", async (c) => {
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) throw new HttpError(404, "not_found", "Coupon not found");
  const rows = await sql<CouponRow[]>`
    update coupons set disabled = true where id = ${id}::uuid returning *
  `;
  if (!rows[0]) throw new HttpError(404, "not_found", "Coupon not found");
  return c.json(shapeCoupon(rows[0]));
});

adminRoutes.get("/coupons/:id/redemptions", async (c) => {
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) throw new HttpError(404, "not_found", "Coupon not found");
  const coupon = await sql<CouponRow[]>`select * from coupons where id = ${id}::uuid`;
  if (!coupon[0]) throw new HttpError(404, "not_found", "Coupon not found");
  const rows = await sql<{ id: string; user_id: string; email: string; redeemed_at: Date }[]>`
    select r.id, r.user_id, u.email, r.redeemed_at
    from coupon_redemptions r
    join users u on u.id = r.user_id
    where r.coupon_id = ${id}::uuid
    order by r.redeemed_at desc
    limit 500
  `;
  return c.json({
    coupon: shapeCoupon(coupon[0]),
    redemptions: rows.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      email: row.email,
      redeemed_at: iso(row.redeemed_at),
    })),
  });
});

// ---------- maintenance ----------

adminRoutes.post("/maintenance/retention", async (c) => {
  const stats = await runRetention();
  return c.json({ ok: true, ...stats });
});
