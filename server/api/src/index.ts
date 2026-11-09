import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { publicUser } from "./access.js";
import { requireUser, type AppEnv } from "./auth.js";
import { sql } from "./db.js";
import { initDb } from "./db.js";
import { apiDocs } from "./docs.js";
import { env } from "./env.js";
import { HttpError } from "./http.js";
import { authRoutes } from "./routes/auth.js";
import { billingRoutes } from "./routes/billing.js";
import { dayRoutes } from "./routes/days.js";
import { museRoutes } from "./routes/muse.js";
import { tokenRoutes } from "./routes/tokens.js";
import { uploadRoutes } from "./routes/upload.js";
import { platformRoutes } from "./routes/platform.js";
import { describeStorage, initStorage, store } from "./storage.js";

const app = new Hono<AppEnv>();

app.use("*", async (c, next) => {
  const started = Date.now();
  await next();
  const type = c.res.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    c.res.headers.set("Cache-Control", "no-store");
  }
  console.log(`${c.req.method} ${new URL(c.req.url).pathname} ${c.res.status} ${Date.now() - started}ms`);
});

app.get("/api/health", async (c) => {
  const storage = describeStorage();
  try {
    await sql`select 1 as ok`;
    if (storage.ready) await store.ping();
    return c.json({
      ok: true,
      storage: storage.driver,
      storage_ready: storage.ready,
      supabase: env.supabaseIntegration,
      billing: env.billingMode,
    });
  } catch (error) {
    console.error(error);
    return c.json({ ok: false, storage: storage.driver, storage_ready: false }, 503);
  }
});

app.get("/api/v1/docs", (c) => {
  return c.text(apiDocs(), 200, { "Content-Type": "text/plain; charset=utf-8" });
});

const v1 = new Hono<AppEnv>();
v1.get("/me", requireUser(), (c) => c.json(publicUser(c.get("user"))));
v1.route("/auth", authRoutes);
v1.route("/upload", uploadRoutes);
v1.route("/days", dayRoutes);
v1.route("/tokens", tokenRoutes);
v1.route("/muse", museRoutes);
v1.route("/billing", billingRoutes);
v1.route("/platform", platformRoutes);
app.route("/api/v1", v1);

app.notFound((c) => c.json({ error: "not_found", message: "Not found" }, 404));

app.onError((error, c) => {
  if (error instanceof HttpError) {
    return c.json(
      { error: error.code, message: error.message, fields: error.fields },
      error.status as 400,
    );
  }
  console.error(error);
  return c.json({ error: "internal", message: "Something went wrong" }, 500);
});

async function main() {
  if (env.jwtSecret.includes("change-me")) {
    console.warn("JWT_SECRET still looks like the example. Change it before exposing this server.");
  }
  if (env.billingMode === "stub") {
    console.warn("Billing is in stub mode. Set STRIPE_SECRET_KEY and STRIPE_PRICE_ID to charge $5/month.");
  }
  await initDb();
  await initStorage();
  serve({ fetch: app.fetch, port: env.apiPort, hostname: env.apiHost }, (info) => {
    console.log(`EchoDay API listening on ${env.apiHost}:${info.port}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
