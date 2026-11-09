import { Hono } from "hono";
import { requireUser, type AppEnv } from "../auth.js";
import { sql } from "../db.js";
import { env } from "../env.js";
import { HttpError } from "../http.js";
import { describeStorage } from "../storage.js";
import {
  findRule,
  integrationStatus,
  parseAllowlist,
  readRequestHeaders,
  restReadUrl,
  supabaseAuthUserId,
  type SupabaseSettings,
} from "../supabase-adapter.js";

function settings(): SupabaseSettings {
  return {
    enabled: env.supabaseIntegration === "enabled",
    url: env.supabaseUrl,
    publishableKey: env.supabasePublishableKey,
    secretKey: env.supabaseSecretKey,
    readMode: env.supabaseReadMode === "service" ? "service" : "user_jwt",
    allowlistRaw: env.supabaseReadAllowlist,
  };
}

function requireEnabled(current: SupabaseSettings) {
  if (!current.enabled) {
    throw new HttpError(503, "supabase_disabled", "Supabase integration is disabled. Set SUPABASE_INTEGRATION=enabled after configuring the server.");
  }
  if (!current.url) {
    throw new HttpError(503, "supabase_unconfigured", "SUPABASE_URL is not set.");
  }
}

async function linkFor(userId: string): Promise<{ supabase_user_id: string } | null> {
  const rows = await sql<{ supabase_user_id: string }[]>`
    select supabase_user_id::text as supabase_user_id
    from supabase_identity_links
    where user_id = ${userId}
  `;
  return rows[0] ?? null;
}

export const platformRoutes = new Hono<AppEnv>();
platformRoutes.use("*", requireUser());

platformRoutes.get("/config", async (c) => {
  const user = c.get("user");
  const link = await linkFor(user.id);
  const current = settings();
  return c.json({
    storage: describeStorage(),
    supabase: { ...integrationStatus(current), linked: Boolean(link) },
    upload: {
      method: "PUT",
      path: "/api/v1/upload/{key}",
      authorization: "Bearer platform-jwt",
    },
  });
});

platformRoutes.get("/supabase/identity", async (c) => {
  const link = await linkFor(c.get("user").id);
  return c.json({
    linked: Boolean(link),
    supabase_user_id: link?.supabase_user_id ?? null,
  });
});

platformRoutes.post("/supabase/identity", async (c) => {
  const current = settings();
  requireEnabled(current);
  const header = c.req.header("x-supabase-authorization") || "";
  const jwt = header.replace(/^Bearer\s+/i, "").trim();
  if (!jwt || jwt === header) {
    throw new HttpError(400, "supabase_jwt_required", "Send the caller's Supabase access token in X-Supabase-Authorization.");
  }
  let supabaseUserId: string;
  try {
    supabaseUserId = await supabaseAuthUserId(current, jwt, fetch);
  } catch {
    throw new HttpError(401, "supabase_identity_rejected", "Supabase did not accept that access token.");
  }
  try {
    await sql`
      insert into supabase_identity_links (user_id, supabase_user_id)
      values (${c.get("user").id}, ${supabaseUserId}::uuid)
      on conflict (user_id) do update set
        supabase_user_id = excluded.supabase_user_id,
        linked_at = now()
    `;
  } catch {
    throw new HttpError(409, "supabase_identity_taken", "That Supabase user is already linked to another account.");
  }
  return c.json({ linked: true, supabase_user_id: supabaseUserId });
});

platformRoutes.delete("/supabase/identity", async (c) => {
  await sql`delete from supabase_identity_links where user_id = ${c.get("user").id}`;
  return c.json({ linked: false });
});

platformRoutes.get("/supabase/tables/:table", async (c) => {
  const current = settings();
  requireEnabled(current);
  let rules;
  try {
    rules = parseAllowlist(current.allowlistRaw);
  } catch (error) {
    throw new HttpError(503, "supabase_read_unconfigured", error instanceof Error ? error.message : "Invalid allowlist");
  }
  if (rules.length === 0) {
    throw new HttpError(
      503,
      "supabase_read_unconfigured",
      "No SUPABASE_READ_ALLOWLIST is configured. Reads stay off until each table has an owner column.",
    );
  }
  const rule = findRule(rules, c.req.param("table"));
  if (!rule) throw new HttpError(404, "table_not_allowed", "That table is not on the server allowlist.");
  const link = await linkFor(c.get("user").id);
  if (!link) throw new HttpError(409, "identity_unlinked", "Link a Supabase user before reading.");
  const header = c.req.header("x-supabase-authorization") || "";
  const jwt = /^Bearer\s+\S+/i.test(header) ? header.replace(/^Bearer\s+/i, "").trim() : null;
  if (jwt) {
    let subject: string;
    try {
      subject = await supabaseAuthUserId(current, jwt, fetch);
    } catch {
      throw new HttpError(401, "supabase_identity_rejected", "Supabase did not accept that access token.");
    }
    if (subject !== link.supabase_user_id) {
      throw new HttpError(403, "supabase_identity_mismatch", "That Supabase token is not the user linked to this account.");
    }
  }
  let headers: { apikey: string; authorization: string };
  try {
    headers = readRequestHeaders(current, jwt);
  } catch {
    throw new HttpError(503, "supabase_unconfigured", "Supabase read credentials are not configured on the server.");
  }
  const limit = Number(c.req.query("limit") || "50");
  const url = restReadUrl(current.url, rule, link.supabase_user_id, Number.isFinite(limit) ? limit : 50);
  const response = await fetch(url, {
    headers: { apikey: headers.apikey, authorization: headers.authorization, accept: "application/json" },
  });
  if (!response.ok) {
    throw new HttpError(502, "supabase_read_failed", `Supabase read failed with HTTP ${response.status}.`);
  }
  const rows = (await response.json()) as unknown;
  if (!Array.isArray(rows)) throw new HttpError(502, "supabase_read_failed", "Supabase did not return a row list.");
  return c.json({ table: rule.table, owner_column: rule.ownerColumn, rows });
});
