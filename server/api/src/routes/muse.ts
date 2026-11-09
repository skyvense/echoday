import { Hono } from "hono";
import { requireMuse, type AppEnv } from "../auth.js";
import { dayDetail, listDays, excerpt, museDownloadUrl, sendStored } from "../days.js";
import { env } from "../env.js";
import { sql } from "../db.js";
import { HttpError } from "../http.js";
import { isDay } from "../layout.js";
import { saveSummary, shapeSummary } from "./days.js";
import { z } from "zod";
import { parseBody, readBodyLimited, readJson } from "../http.js";
import { store } from "../storage.js";

const summarySchema = z.object({
  markdown: z.string().trim().min(1).max(200_000),
  transcript_markdown: z.string().max(2_000_000).nullable().optional(),
  analyses_json: z.array(z.unknown()).max(100).optional(),
  photo_analysis_markdown: z.string().max(200_000).nullable().optional(),
  source: z.enum(["muse", "manual"]).optional(),
  model: z.string().trim().max(120).nullable().optional(),
});

export const museRoutes = new Hono<AppEnv>();

museRoutes.get("/days", requireMuse("days:read"), async (c) => {
  const rows = await listDays(c.get("user").id, c.req.query("q") ?? "");
  return c.json({
    days: rows.map((row) => ({
      date: row.day,
      audio_count: row.audio_count,
      marker_count: row.marker_count,
      snapshot_count: row.snapshot_count,
      bytes: Number(row.bytes),
      summary_excerpt: excerpt(row.summary),
      url: `${env.publicUrl}/api/v1/muse/days/${row.day}`,
    })),
  });
});

museRoutes.get("/days/:date", requireMuse("days:read"), async (c) => {
  const date = c.req.param("date");
  if (!isDay(date)) throw new HttpError(400, "bad_date", "Date must be YYYY-MM-DD");
  const detail = await dayDetail(c.get("user").id, date);
  if (!detail) throw new HttpError(404, "not_found", "No recordings for that day");
  const audio = detail.objects.filter((object) => object.kind === "segment" || object.kind === "note");
  const snapshots = detail.objects.filter((object) => object.kind === "snapshot");
  const markerObject = detail.objects.find((object) => object.kind === "markers");
  return c.json({
    date,
    audio: audio.map((object) => ({
      filename: object.filename,
      kind: object.kind,
      bytes: Number(object.bytes),
      sha256: object.sha256,
      content_type: object.content_type,
      uploaded_at: new Date(object.uploaded_at).toISOString(),
      download_url: museDownloadUrl(date, "segments", object.filename),
    })),
    snapshots: snapshots.map((object) => ({
      filename: object.filename,
      bytes: Number(object.bytes),
      download_url: museDownloadUrl(date, "snapshots", object.filename),
    })),
    markers: detail.markers.map((marker) => ({
      line_no: marker.line_no,
      ts: marker.ts,
      epoch_ms: marker.epoch_ms === null ? null : Number(marker.epoch_ms),
      type: marker.type,
    })),
    markers_download_url: markerObject
      ? `${env.publicUrl}/api/v1/muse/days/${date}/markers/raw`
      : null,
    summary: detail.summary ? shapeSummary(detail.summary, date) : null,
    summary_url: `${env.publicUrl}/api/v1/muse/days/${date}/summary`,
  });
});

museRoutes.get("/days/:date/segments/:filename", requireMuse("audio:read"), async (c) => {
  return sendMuseFile(c, c.req.param("date"), c.req.param("filename"), ["segment", "note"]);
});

museRoutes.get("/days/:date/snapshots/:filename", requireMuse("audio:read"), async (c) => {
  return sendMuseFile(c, c.req.param("date"), c.req.param("filename"), ["snapshot"]);
});

museRoutes.get("/days/:date/markers", requireMuse("markers:read"), async (c) => {
  const date = c.req.param("date");
  if (!isDay(date)) throw new HttpError(400, "bad_date", "Date must be YYYY-MM-DD");
  const detail = await dayDetail(c.get("user").id, date);
  if (!detail) throw new HttpError(404, "not_found", "No recordings for that day");
  return c.json({
    date,
    markers: detail.markers.map((marker) => ({
      line_no: marker.line_no,
      ts: marker.ts,
      epoch_ms: marker.epoch_ms === null ? null : Number(marker.epoch_ms),
      type: marker.type,
      raw: marker.raw,
    })),
  });
});

museRoutes.get("/days/:date/markers/raw", requireMuse("markers:read"), async (c) => {
  const date = c.req.param("date");
  if (!isDay(date)) throw new HttpError(400, "bad_date", "Date must be YYYY-MM-DD");
  const rows = await sql<{ storage_key: string; filename: string }[]>`
    select storage_key, filename from objects
    where user_id = ${c.get("user").id} and day = ${date} and kind = 'markers'
  `;
  const row = rows[0];
  if (!row) {
    return new Response("", {
      status: 200,
      headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
    });
  }
  return sendStored(c, row.storage_key, "application/x-ndjson; charset=utf-8", row.filename, false);
});

museRoutes.get("/days/:date/summary", requireMuse("summary:read"), async (c) => {
  const date = c.req.param("date");
  if (!isDay(date)) throw new HttpError(400, "bad_date", "Date must be YYYY-MM-DD");
  const detail = await dayDetail(c.get("user").id, date);
  if (!detail?.summary) throw new HttpError(404, "not_found", "No summary for that day yet");
  return c.json(shapeSummary(detail.summary, date));
});

museRoutes.put("/days/:date/summary", requireMuse("summary:write"), async (c) => {
  const date = c.req.param("date");
  if (!isDay(date)) throw new HttpError(400, "bad_date", "Date must be YYYY-MM-DD");
  const raw = (await readJson(c)) as Record<string, unknown>;
  const input = parseBody(summarySchema, raw);
  const saved = await saveSummary(c.get("user").id, date, input, raw, "muse");
  return c.json(shapeSummary(saved!, date));
});

// Daily recognition result (audio + photo) — same payload as the summary
// push, under the name the product plan uses. Kept alongside /summary.
museRoutes.get("/days/:date/result", requireMuse("summary:read"), async (c) => {
  const date = c.req.param("date");
  if (!isDay(date)) throw new HttpError(400, "bad_date", "Date must be YYYY-MM-DD");
  const detail = await dayDetail(c.get("user").id, date);
  if (!detail?.summary) throw new HttpError(404, "not_found", "No result for that day yet");
  return c.json(shapeSummary(detail.summary, date));
});

museRoutes.put("/days/:date/result", requireMuse("summary:write"), async (c) => {
  const date = c.req.param("date");
  if (!isDay(date)) throw new HttpError(400, "bad_date", "Date must be YYYY-MM-DD");
  const raw = (await readJson(c)) as Record<string, unknown>;
  const input = parseBody(summarySchema, raw);
  const saved = await saveSummary(c.get("user").id, date, input, raw, "muse");
  return c.json(shapeSummary(saved!, date));
});

museRoutes.put("/days/:date/sheet", requireMuse("summary:write"), async (c) => {
  const date = c.req.param("date");
  if (!isDay(date)) throw new HttpError(400, "bad_date", "Date must be YYYY-MM-DD");
  const body = await readBodyLimited(c, env.maxUploadBytes);
  if (body.length < 32) {
    throw new HttpError(400, "empty_object", "Sheet image must be at least 32 bytes");
  }
  const userId = c.get("user").id;
  const sheetKey = `${userId}/sheet-${date}/daily_sheet.jpg`;
  await store.put(sheetKey, body);
  await sql`
    with day_row as (
      insert into days (user_id, day)
      values (${userId}, ${date})
      on conflict (user_id, day) do update set updated_at = now()
      returning id, user_id, day
    )
    insert into summaries (day_id, user_id, day, markdown, source, sheet_key)
    select id, user_id, day, '', 'muse', ${sheetKey}
    from day_row
    on conflict (day_id) do update set
      sheet_key = excluded.sheet_key,
      updated_at = now()
  `;
  return c.json({ date, sheet_key: sheetKey, bytes: body.length });
});

museRoutes.get("/days/:date/sheet", requireMuse("summary:read"), async (c) => {
  const date = c.req.param("date");
  if (!isDay(date)) throw new HttpError(400, "bad_date", "Date must be YYYY-MM-DD");
  const detail = await dayDetail(c.get("user").id, date);
  const sheetKey = detail?.summary?.sheet_key;
  if (!sheetKey) throw new HttpError(404, "not_found", "No activity sheet for that day yet");
  return sendStored(c, sheetKey, "image/jpeg", `daily_sheet_${date}.jpg`, true);
});

async function sendMuseFile(
  c: Parameters<typeof sendStored>[0],
  date: string,
  filename: string,
  kinds: string[],
) {
  if (!isDay(date)) throw new HttpError(400, "bad_date", "Date must be YYYY-MM-DD");
  const safeName = decodeURIComponent(filename);
  if (safeName.includes("/") || safeName.includes("..")) {
    throw new HttpError(400, "bad_filename", "Bad filename");
  }
  const rows = await sql<{ storage_key: string; content_type: string; filename: string }[]>`
    select storage_key, content_type, filename
    from objects
    where user_id = ${c.get("user").id}
      and day = ${date}
      and filename = ${safeName}
      and kind = any(${kinds})
  `;
  const row = rows[0];
  if (!row) throw new HttpError(404, "not_found", "File not found");
  return sendStored(c, row.storage_key, row.content_type, row.filename, true);
}
