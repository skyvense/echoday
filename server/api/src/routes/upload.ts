import { createHash } from "node:crypto";
import { Hono } from "hono";
import { accessOf } from "../access.js";
import { requireUser, type AppEnv } from "../auth.js";
import { sql } from "../db.js";
import { env } from "../env.js";
import { HttpError, readBodyLimited } from "../http.js";
import { parseLogicalKey, parseMarkers } from "../layout.js";
import { StorageUnconfigured, store } from "../storage.js";

export const uploadRoutes = new Hono<AppEnv>();

uploadRoutes.put("/*", requireUser(), async (c) => {
  const user = c.get("user");
  const access = accessOf(user);
  if (!access.upload) {
    return c.json(
      {
        error: "subscription_required",
        message:
          access.reason === "past_due"
            ? "The subscription payment is past due. The archive is read-only until billing is current."
            : "The 7-day trial has ended. The archive stays readable, and new uploads wait for the $5 monthly subscription.",
        billing_url: `${env.publicUrl}/billing`,
      },
      402,
    );
  }

  const pathname = new URL(c.req.url).pathname;
  const prefix = "/api/v1/upload/";
  if (!pathname.startsWith(prefix)) {
    throw new HttpError(404, "not_found", "Not found");
  }
  const parsed = parseLogicalKey(pathname.slice(prefix.length));
  if (!parsed) {
    throw new HttpError(
      400,
      "bad_key",
      "Key must match muse-recorder layout: YYYY-MM-DD/rec_YYYY-MM-DD_HH-mm-ss.m4a, note_….m4a, markers/events-YYYY-MM-DD.jsonl, or snapshot-YYYY-MM-DD/snap_….jpg",
    );
  }

  const max = parsed.kind === "markers" ? 2 * 1024 * 1024 : env.maxUploadBytes;
  const body = await readBodyLimited(c, max);
  if (parsed.kind !== "markers" && body.length < 32) {
    throw new HttpError(400, "empty_object", "Audio and snapshot uploads must be at least 32 bytes");
  }

  // Storage quota (free/trial 2 GB, paid 20 GB by default). When the quota
  // is full, new uploads stop until the user's agent has pulled a day,
  // pushed its result back, and the retention job freed the originals.
  // Re-uploading an existing key still counts its old bytes once more;
  // uploads are write-once segments in practice, so this stays simple.
  const usageRows = await sql<{ total: string }[]>`
    select coalesce(sum(bytes), 0)::text as total from objects where user_id = ${user.id}
  `;
  const usageBytes = Number(usageRows[0]?.total ?? 0);
  if (usageBytes + body.length > access.quotaBytes) {
    return c.json(
      {
        error: "quota_exceeded",
        message:
          "Storage quota is full. New uploads pause until your Muse processes a day and its originals are cleaned up, or you upgrade.",
        usage_bytes: usageBytes,
        quota_bytes: access.quotaBytes,
        billing_url: `${env.publicUrl}/billing`,
      },
      413,
    );
  }

  const markers = parsed.kind === "markers" ? parseMarkers(body) : [];
  const sha256 = createHash("sha256").update(body).digest("hex");
  const storageKey = `${user.id}/${parsed.logicalKey}`;
  try {
    await store.put(storageKey, body);
  } catch (error) {
    if (error instanceof StorageUnconfigured) {
      throw new HttpError(503, "storage_unconfigured", error.message);
    }
    throw error;
  }

  const saved = await sql.begin(async (trx) => {
    const dayRows = await trx<{ id: string }[]>`
      insert into days (user_id, day)
      values (${user.id}, ${parsed.day})
      on conflict (user_id, day) do update set updated_at = now()
      returning id
    `;
    const dayId = dayRows[0]!.id;
    const objectRows = await trx<{ id: string }[]>`
      insert into objects (
        user_id, day_id, day, logical_key, filename, kind, bytes, sha256, content_type, storage_key
      ) values (
        ${user.id}, ${dayId}, ${parsed.day}, ${parsed.logicalKey}, ${parsed.filename},
        ${parsed.kind}, ${body.length}, ${sha256}, ${parsed.contentType}, ${storageKey}
      )
      on conflict (user_id, logical_key) do update set
        day_id = excluded.day_id,
        day = excluded.day,
        filename = excluded.filename,
        kind = excluded.kind,
        bytes = excluded.bytes,
        sha256 = excluded.sha256,
        content_type = excluded.content_type,
        storage_key = excluded.storage_key,
        uploaded_at = now()
      returning id
    `;
    if (parsed.kind === "markers") {
      await trx`delete from markers where user_id = ${user.id} and day = ${parsed.day}`;
      for (const marker of markers) {
        await trx`
          insert into markers (user_id, day_id, day, line_no, ts, epoch_ms, type, raw)
          values (
            ${user.id}, ${dayId}, ${parsed.day}, ${marker.line_no},
            ${marker.ts}, ${marker.epoch_ms}, ${marker.type}, ${trx.json(JSON.parse(JSON.stringify(marker.raw)))}
          )
        `;
      }
    }
    return { dayId, objectId: objectRows[0]!.id };
  });

  return c.json({
    ok: true,
    key: parsed.logicalKey,
    day: parsed.day,
    filename: parsed.filename,
    kind: parsed.kind,
    bytes: body.length,
    sha256,
    markers: parsed.kind === "markers" ? markers.length : undefined,
    id: saved.objectId,
  });
});
