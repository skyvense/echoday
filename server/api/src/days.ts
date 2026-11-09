import type { Context } from "hono";
import { sql } from "./db.js";
import { env } from "./env.js";
import { likeContains } from "./http.js";
import { parseByteRange, store, webStream } from "./storage.js";
import type { AppEnv } from "./auth.js";

export interface DayListRow {
  day: string;
  audio_count: number;
  marker_count: number;
  snapshot_count: number;
  bytes: string | number;
  summary: string | null;
  summary_updated_at: Date | null;
  has_sheet: boolean;
}

export async function listDays(userId: string, query: string): Promise<DayListRow[]> {
  const q = query.trim().slice(0, 200);
  const pattern = likeContains(q);
  const rows = await sql<DayListRow[]>`
    select
      to_char(d.day, 'YYYY-MM-DD') as day,
      (select count(*)::int from objects o where o.day_id = d.id and o.kind in ('segment', 'note')) as audio_count,
      (select count(*)::int from markers m where m.day_id = d.id) as marker_count,
      (select count(*)::int from objects o where o.day_id = d.id and o.kind = 'snapshot') as snapshot_count,
      coalesce((select sum(bytes) from objects o where o.day_id = d.id and o.kind in ('segment', 'note')), 0) as bytes,
      s.markdown as summary,
      s.updated_at as summary_updated_at,
      (s.sheet_key is not null) as has_sheet
    from days d
    left join summaries s on s.day_id = d.id
    where d.user_id = ${userId}
      and (
        ${q} = ''
        or to_char(d.day, 'YYYY-MM-DD') ilike ${pattern} escape '\\'
        or coalesce(s.markdown, '') ilike ${pattern} escape '\\'
        or coalesce(s.transcript_markdown, '') ilike ${pattern} escape '\\'
        or exists (
          select 1 from markers m
          where m.day_id = d.id
            and (coalesce(m.type, '') ilike ${pattern} escape '\\' or m.raw::text ilike ${pattern} escape '\\')
        )
        or exists (
          select 1 from objects o
          where o.day_id = d.id and o.deleted_at is null and o.filename ilike ${pattern} escape '\\'
        )
      )
    order by d.day desc
    limit 200
  `;
  return rows;
}

export function excerpt(markdown: string | null): string | null {
  if (!markdown) return null;
  const flat = markdown.replace(/\s+/g, " ").trim();
  if (flat.length <= 180) return flat;
  return flat.slice(0, 177) + "…";
}

interface ObjectRow {
  filename: string;
  kind: string;
  bytes: string | number;
  sha256: string;
  content_type: string;
  storage_key: string;
  logical_key: string;
  uploaded_at: Date;
}

export async function dayDetail(userId: string, day: string) {
  const days = await sql<{ id: string }[]>`
    select id from days where user_id = ${userId} and day = ${day}
  `;
  const dayRow = days[0];
  if (!dayRow) return null;
  const objects = await sql<ObjectRow[]>`
    select filename, kind, bytes, sha256, content_type, storage_key, logical_key, uploaded_at
    from objects
    where day_id = ${dayRow.id} and deleted_at is null
    order by filename asc
  `;
  const markers = await sql<
    { line_no: number; ts: string | null; epoch_ms: string | number | null; type: string | null; raw: unknown }[]
  >`
    select line_no, ts, epoch_ms, type, raw
    from markers
    where day_id = ${dayRow.id}
    order by line_no asc
  `;
  const summaries = await sql<
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
    select markdown, transcript_markdown, analyses_json, photo_analysis_markdown, sheet_key, source, model, updated_at
    from summaries where day_id = ${dayRow.id}
  `;
  const summary = summaries[0] ?? null;
  return { id: dayRow.id, objects, markers, summary };
}

export function museDownloadUrl(day: string, kind: "segments" | "snapshots", filename: string): string {
  return `${env.publicUrl}/api/v1/muse/days/${day}/${kind}/${encodeURIComponent(filename)}`;
}

export async function sendStored(
  c: Context<AppEnv>,
  storageKey: string,
  contentType: string,
  filename: string,
  inline: boolean,
): Promise<Response> {
  const size = await store.size(storageKey);
  if (size === null) {
    return c.json({ error: "missing_blob", message: "The file is no longer in storage" }, 404);
  }
  if (size === 0) {
    return new Response(null, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": "0",
        "Accept-Ranges": "bytes",
      },
    });
  }
  const range = parseByteRange(c.req.header("range"), size);
  if (range === "invalid") {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${size}` },
    });
  }
  const start = range?.start ?? 0;
  const end = range?.end ?? size - 1;
  const opened = await store.open(storageKey, start, end);
  if (!opened) {
    return c.json({ error: "missing_blob", message: "The file is no longer in storage" }, 404);
  }
  const headers = new Headers();
  headers.set("Content-Type", contentType);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Content-Length", String(end - start + 1));
  headers.set("Cache-Control", "private, max-age=3600");
  const disposition = inline ? "inline" : "attachment";
  headers.set("Content-Disposition", `${disposition}; filename="${filename.replace(/"/g, "")}"`);
  if (range) headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  return new Response(webStream(opened.stream), { status: range ? 206 : 200, headers });
}
