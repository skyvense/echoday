import { Hono } from "hono";
import { z } from "zod";
import { requireUser, type AppEnv } from "../auth.js";
import { dayDetail, excerpt, listDays, sendStored } from "../days.js";
import { sql } from "../db.js";
import { HttpError, parseBody, readJson } from "../http.js";
import { isDay } from "../layout.js";

const summarySchema = z.object({
  markdown: z.string().trim().min(1).max(200_000),
  transcript_markdown: z.string().max(2_000_000).nullable().optional(),
  analyses_json: z.array(z.unknown()).max(100).optional(),
  photo_analysis_markdown: z.string().max(200_000).nullable().optional(),
  source: z.enum(["muse", "manual"]).optional(),
  model: z.string().trim().max(120).nullable().optional(),
});

async function saveSummary(
  userId: string,
  day: string,
  input: z.infer<typeof summarySchema>,
  raw: Record<string, unknown>,
  defaultSource: "muse" | "manual",
) {
  const setTranscript = Object.prototype.hasOwnProperty.call(raw, "transcript_markdown");
  const setAnalyses = Object.prototype.hasOwnProperty.call(raw, "analyses_json");
  const setPhoto = Object.prototype.hasOwnProperty.call(raw, "photo_analysis_markdown");
  const setModel = Object.prototype.hasOwnProperty.call(raw, "model");
  const source = input.source ?? defaultSource;
  const analysesJson = setAnalyses ? sql.json((input.analyses_json ?? []) as never) : null;
  const rows = await sql<
    {
      markdown: string;
      transcript_markdown: string | null;
      analyses_json: unknown;
      photo_analysis_markdown: string | null;
      sheet_key: string | null;
      source: string;
      model: string | null;
      updated_at: Date;
    }[]
  >`
    with day_row as (
      insert into days (user_id, day)
      values (${userId}, ${day})
      on conflict (user_id, day) do update set updated_at = now()
      returning id, user_id, day
    )
    insert into summaries (day_id, user_id, day, markdown, transcript_markdown, analyses_json, photo_analysis_markdown, source, model)
    select id, user_id, day, ${input.markdown}, ${setTranscript ? input.transcript_markdown ?? null : null},
      ${setAnalyses ? analysesJson : sql.json([] as never)}, ${setPhoto ? input.photo_analysis_markdown ?? null : null}, ${source}, ${setModel ? input.model ?? null : null}
    from day_row
    on conflict (day_id) do update set
      markdown = excluded.markdown,
      transcript_markdown = case
        when ${setTranscript} then excluded.transcript_markdown
        else summaries.transcript_markdown
      end,
      analyses_json = case
        when ${setAnalyses} then excluded.analyses_json
        else summaries.analyses_json
      end,
      photo_analysis_markdown = case
        when ${setPhoto} then excluded.photo_analysis_markdown
        else summaries.photo_analysis_markdown
      end,
      source = excluded.source,
      model = case when ${setModel} then excluded.model else summaries.model end,
      updated_at = now()
    returning markdown, transcript_markdown, analyses_json, photo_analysis_markdown, sheet_key, source, model, updated_at, day
  `;
  return rows[0];
}

export const dayRoutes = new Hono<AppEnv>();

dayRoutes.use("*", requireUser());

dayRoutes.get("/", async (c) => {
  const user = c.get("user");
  const q = c.req.query("q") ?? "";
  const rows = await listDays(user.id, q);
  return c.json({
    days: rows.map((row) => ({
      date: row.day,
      audio_count: row.audio_count,
      marker_count: row.marker_count,
      snapshot_count: row.snapshot_count,
      bytes: Number(row.bytes),
      summary_excerpt: excerpt(row.summary),
      summary_updated_at: row.summary_updated_at ? new Date(row.summary_updated_at).toISOString() : null,
    })),
  });
});

dayRoutes.get("/:date", async (c) => {
  const date = c.req.param("date");
  if (!isDay(date)) throw new HttpError(400, "bad_date", "Date must be YYYY-MM-DD");
  const detail = await dayDetail(c.get("user").id, date);
  if (!detail) throw new HttpError(404, "not_found", "No recordings for that day");
  return c.json(shapeDay(date, detail, false));
});

dayRoutes.get("/:date/audio/:filename", async (c) => {
  return sendDayFile(c, c.req.param("date"), c.req.param("filename"), ["segment", "note"], true);
});

dayRoutes.get("/:date/snapshots/:filename", async (c) => {
  return sendDayFile(c, c.req.param("date"), c.req.param("filename"), ["snapshot"], true);
});

dayRoutes.get("/:date/markers", async (c) => {
  const date = c.req.param("date");
  if (!isDay(date)) throw new HttpError(400, "bad_date", "Date must be YYYY-MM-DD");
  const detail = await dayDetail(c.get("user").id, date);
  if (!detail) throw new HttpError(404, "not_found", "No recordings for that day");
  return c.json({ date, markers: detail.markers.map(shapeMarker) });
});

dayRoutes.get("/:date/summary", async (c) => {
  const date = c.req.param("date");
  if (!isDay(date)) throw new HttpError(400, "bad_date", "Date must be YYYY-MM-DD");
  const detail = await dayDetail(c.get("user").id, date);
  if (!detail?.summary) throw new HttpError(404, "not_found", "No summary for that day yet");
  return c.json(shapeSummary(detail.summary, date));
});

dayRoutes.put("/:date/summary", async (c) => {
  const date = c.req.param("date");
  if (!isDay(date)) throw new HttpError(400, "bad_date", "Date must be YYYY-MM-DD");
  const raw = (await readJson(c)) as Record<string, unknown>;
  const input = parseBody(summarySchema, raw);
  const saved = await saveSummary(c.get("user").id, date, input, raw, "manual");
  return c.json(shapeSummary(saved!, date));
});

dayRoutes.get("/:date/result", async (c) => {
  const date = c.req.param("date");
  if (!isDay(date)) throw new HttpError(400, "bad_date", "Date must be YYYY-MM-DD");
  const detail = await dayDetail(c.get("user").id, date);
  if (!detail?.summary) throw new HttpError(404, "not_found", "No result for that day yet");
  return c.json(shapeSummary(detail.summary, date));
});

dayRoutes.get("/:date/sheet", async (c) => {
  const date = c.req.param("date");
  if (!isDay(date)) throw new HttpError(400, "bad_date", "Date must be YYYY-MM-DD");
  const detail = await dayDetail(c.get("user").id, date);
  const sheetKey = detail?.summary?.sheet_key;
  if (!sheetKey) throw new HttpError(404, "not_found", "No activity sheet for that day yet");
  return sendStored(c, sheetKey, "image/jpeg", `daily_sheet_${date}.jpg`, true);
});

async function sendDayFile(
  c: Parameters<typeof sendStored>[0],
  date: string,
  filename: string,
  kinds: string[],
  inline: boolean,
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
  return sendStored(c, row.storage_key, row.content_type, row.filename, inline);
}

function shapeMarker(marker: {
  line_no: number;
  ts: string | null;
  epoch_ms: string | number | null;
  type: string | null;
  raw: unknown;
}) {
  return {
    line_no: marker.line_no,
    ts: marker.ts,
    epoch_ms: marker.epoch_ms === null ? null : Number(marker.epoch_ms),
    type: marker.type,
    raw: marker.raw,
  };
}

function shapeSummary(
  summary: {
    markdown: string;
    transcript_markdown: string | null;
    analyses_json?: unknown;
    photo_analysis_markdown?: string | null;
    sheet_key?: string | null;
    source: string;
    model: string | null;
    updated_at: Date | string;
  },
  date: string,
) {
  return {
    date,
    markdown: summary.markdown,
    transcript_markdown: summary.transcript_markdown,
    analyses_json: summary.analyses_json ?? [],
    photo_analysis_markdown: summary.photo_analysis_markdown ?? null,
    has_sheet: Boolean(summary.sheet_key),
    source: summary.source,
    model: summary.model,
    updated_at: new Date(summary.updated_at).toISOString(),
  };
}

function shapeDay(
  date: string,
  detail: NonNullable<Awaited<ReturnType<typeof dayDetail>>>,
  absoluteMuseUrls: boolean,
) {
  const audio = detail.objects.filter((object) => object.kind === "segment" || object.kind === "note");
  const snapshots = detail.objects.filter((object) => object.kind === "snapshot");
  const fileUrl = (kind: "audio" | "snapshots", filename: string) =>
    absoluteMuseUrls
      ? undefined
      : `/api/v1/days/${date}/${kind}/${encodeURIComponent(filename)}`;
  return {
    date,
    audio: audio.map((object) => ({
      filename: object.filename,
      kind: object.kind,
      bytes: Number(object.bytes),
      sha256: object.sha256,
      content_type: object.content_type,
      uploaded_at: new Date(object.uploaded_at).toISOString(),
      url: fileUrl("audio", object.filename),
    })),
    snapshots: snapshots.map((object) => ({
      filename: object.filename,
      bytes: Number(object.bytes),
      uploaded_at: new Date(object.uploaded_at).toISOString(),
      url: fileUrl("snapshots", object.filename),
    })),
    markers: detail.markers.map(shapeMarker),
    summary: detail.summary ? shapeSummary(detail.summary, date) : null,
  };
}

export { saveSummary, shapeDay, shapeSummary };
