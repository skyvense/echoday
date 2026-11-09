import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { publicUser } from "./access.js";
import { requireUser, type AppEnv } from "./auth.js";
import { sql } from "./db.js";
import { initDb } from "./db.js";
import { apiDocs } from "./docs.js";
import { env } from "./env.js";
import { HttpError } from "./http.js";
import { adminRoutes } from "./routes/admin.js";
import { authRoutes } from "./routes/auth.js";
import { billingRoutes } from "./routes/billing.js";
import { couponRoutes } from "./routes/coupons.js";
import { dayRoutes } from "./routes/days.js";
import { museRoutes } from "./routes/muse.js";
import { tokenRoutes } from "./routes/tokens.js";
import { uploadRoutes } from "./routes/upload.js";
import { platformRoutes } from "./routes/platform.js";
import { runRetention } from "./retention.js";
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

// Activity log for the admin console: app uploads and agent (muse token)
// requests. Written after the response, never blocking or failing it.
v1.use("*", async (c, next) => {
  let thrown: unknown = null;
  let thrownStatus = 0;
  try {
    await next();
  } catch (error) {
    thrown = error;
    thrownStatus = error instanceof HttpError ? error.status : 500;
  }
  try {
    const pathname = new URL(c.req.url).pathname;
    const isMuse = pathname.startsWith("/api/v1/muse/");
    const isUpload = pathname.startsWith("/api/v1/upload/") && c.req.method === "PUT";
    if (!isMuse && !isUpload) return;
    const user = c.get("user");
    if (!user) return;
    const status = thrownStatus || c.res.status;
    const ip =
      c.req.header("x-real-ip") ||
      (c.req.header("x-forwarded-for") || "").split(",")[0]!.trim() ||
      "";
    let kind = "agent";
    let detail = "";
    if (isUpload) {
      kind = "upload";
      const key = decodeURIComponent(pathname.slice("/api/v1/upload/".length));
      const storeName = env.storageDriver === "fs" ? "本地存储" : "R2";
      detail =
        status >= 200 && status < 300
          ? `上传 ${key} 到平台 · ${storeName}存储成功`
          : `上传 ${key} 失败 · HTTP ${status}`;
    } else {
      const sub = pathname.slice("/api/v1/muse".length);
      const dayMatch = sub.match(/^\/days\/(\d{4}-\d{2}-\d{2})(?:\/(.*))?$/);
      const rest = dayMatch?.[2] ?? "";
      if (sub === "/days") {
        detail = `agent 查询日子列表`;
      } else if (dayMatch && rest === "manifest") {
        detail = `agent 查询 ${dayMatch[1]} 的清单（manifest）`;
      } else if (dayMatch && rest === "result" && c.req.method === "PUT") {
        detail = `agent 回传 ${dayMatch[1]} 的日报`;
      } else if (dayMatch && rest === "result") {
        detail = `agent 读取 ${dayMatch[1]} 的日报`;
      } else if (dayMatch && rest === "sheet") {
        detail = `agent 回传 ${dayMatch[1]} 的活动图`;
      } else if (dayMatch && rest.startsWith("files/")) {
        detail = `agent 下载 ${decodeURIComponent(rest.slice("files/".length))}`;
      } else {
        detail = `agent 请求 ${c.req.method} ${sub}`;
      }
      detail += ` · HTTP ${status}`;
    }
    await sql`
      insert into activity_log (user_id, actor, ip, kind, detail)
      values (${user.id}, ${user.email}, ${ip}, ${kind}, ${detail})
    `;
  } catch (error) {
    console.error("activity log write failed", error);
  }
  if (thrown) throw thrown;
});

v1.get("/me", requireUser(), (c) => c.json(publicUser(c.get("user"))));
v1.route("/auth", authRoutes);
v1.route("/upload", uploadRoutes);
v1.route("/days", dayRoutes);
v1.route("/tokens", tokenRoutes);
v1.route("/muse", museRoutes);
v1.route("/billing", billingRoutes);
v1.route("/coupons", couponRoutes);
v1.route("/admin", adminRoutes);
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
  scheduleRetention();
}

/** Daily originals-cleanup, in-process; also runnable from the admin API. */
function scheduleRetention() {
  const run = () => {
    runRetention()
      .then((stats) => {
        if (stats.objects_deleted > 0 || stats.errors > 0) {
          console.log(`retention run: ${JSON.stringify(stats)}`);
        }
      })
      .catch((error) => console.error("retention run failed", error));
  };
  setTimeout(run, 60 * 1000);
  setInterval(run, 24 * 60 * 60 * 1000);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
