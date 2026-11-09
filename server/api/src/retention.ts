import { accessOf } from "./access.js";
import { sql, type UserRow } from "./db.js";
import { env } from "./env.js";
import { store } from "./storage.js";

// Originals retention.
//
// "Originals" are the uploaded blobs behind objects rows of kind segment /
// note / snapshot. Markers (the markers table and the kind='markers'
// object), summaries, and daily sheet images are kept forever; the days
// row stays and is stamped with originals_deleted_at once its originals
// are gone. Quota usage sums only live rows, so retention tombstones the
// rows (deleted_at) instead of deleting them: quota frees immediately,
// while the per-day counts in the days list stay historical and truthful.
//
// Timing basis (which timestamps decide):
// - The cleanup runs once a day at 08:00 Asia/Shanghai.
// - A day WITH a result (a summaries row): the agent has taken the data
//   away and analysed it, so its originals are deleted at the first
//   cleanup whose Asia/Shanghai calendar day is later than the day the
//   result landed (summaries.updated_at) — in other words, at the 08:00
//   run on the following day.
// - A day WITHOUT a result: timed from the day's last original upload
//   (max objects.uploaded_at). Limit 7 days (free) / 90 days (paid).
// "Paid" is judged at deletion time with the same accessOf() rules the
// upload gate uses (subscription_status = 'active').

export const ORIGINAL_KINDS = ["segment", "note", "snapshot"] as const;

export interface RetentionCandidate {
  hasResult: boolean;
  /** summaries.updated_at when processed, else the day's last upload. */
  anchorAt: Date;
  paid: boolean;
}

export function retentionLimitDays(candidate: Pick<RetentionCandidate, "hasResult" | "paid">): number {
  // Processed days are schedule-based (next 08:00 cleanup), not age-based.
  if (candidate.hasResult) return 0;
  return candidate.paid ? env.retentionUnprocessedPaidDays : env.retentionUnprocessedFreeDays;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const CST_OFFSET_MS = 8 * 60 * 60 * 1000;

function cstDayStartMs(t: Date): number {
  return Math.floor((t.getTime() + CST_OFFSET_MS) / DAY_MS) * DAY_MS - CST_OFFSET_MS;
}

export function retentionDue(candidate: RetentionCandidate, now: Date): boolean {
  if (candidate.hasResult) {
    return cstDayStartMs(new Date(candidate.anchorAt)) < cstDayStartMs(now);
  }
  const ageMs = now.getTime() - new Date(candidate.anchorAt).getTime();
  return ageMs >= retentionLimitDays(candidate) * DAY_MS;
}

function humanBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export interface RetentionStats {
  days_processed: number;
  days_unprocessed: number;
  objects_deleted: number;
  bytes_freed: number;
  errors: number;
}

interface CandidateRow {
  day_id: string;
  user_id: string;
  day: string;
  summary_updated_at: Date | null;
  last_upload_at: Date | null;
}

let running = false;

export async function runRetention(now: Date = new Date()): Promise<RetentionStats> {
  const stats: RetentionStats = {
    days_processed: 0,
    days_unprocessed: 0,
    objects_deleted: 0,
    bytes_freed: 0,
    errors: 0,
  };
  if (running) return stats;
  running = true;
  try {
    const candidates = await sql<CandidateRow[]>`
      select
        d.id as day_id,
        d.user_id,
        to_char(d.day, 'YYYY-MM-DD') as day,
        s.updated_at as summary_updated_at,
        (select max(o.uploaded_at) from objects o
          where o.day_id = d.id and o.deleted_at is null and o.kind = any(${[...ORIGINAL_KINDS]})) as last_upload_at
      from days d
      left join summaries s on s.day_id = d.id
      where d.originals_deleted_at is null
        and exists (
          select 1 from objects o
          where o.day_id = d.id and o.deleted_at is null and o.kind = any(${[...ORIGINAL_KINDS]})
        )
    `;
    for (const row of candidates) {
      const user = await sql<UserRow[]>`select * from users where id = ${row.user_id}`;
      if (!user[0]) continue;
      const candidate: RetentionCandidate = {
        hasResult: row.summary_updated_at !== null,
        anchorAt: row.summary_updated_at ?? row.last_upload_at ?? now,
        paid: accessOf(user[0]).mode === "paid",
      };
      if (!retentionDue(candidate, now)) continue;

      const objects = await sql<{ id: string; storage_key: string; bytes: string | number }[]>`
        select id, storage_key, bytes from objects
        where day_id = ${row.day_id} and deleted_at is null and kind = any(${[...ORIGINAL_KINDS]})
      `;
      let dayFailed = false;
      for (const object of objects) {
        try {
          await store.remove(object.storage_key);
          await sql`update objects set deleted_at = now() where id = ${object.id}`;
          stats.objects_deleted += 1;
          stats.bytes_freed += Number(object.bytes);
        } catch (error) {
          // Keep the row so the next run retries this blob.
          dayFailed = true;
          stats.errors += 1;
          console.error(`retention: could not delete blob ${object.storage_key}`, error);
        }
      }
      if (!dayFailed) {
        await sql`update days set originals_deleted_at = ${now} where id = ${row.day_id}`;
        if (candidate.hasResult) stats.days_processed += 1;
        else stats.days_unprocessed += 1;
        if (objects.length > 0) {
          const freed = objects.reduce((sum, object) => sum + Number(object.bytes), 0);
          await sql`
            insert into activity_log (user_id, actor, ip, kind, detail)
            values (${row.user_id}, ${user[0].email}, '', 'system',
              ${`保留期清理：删除 ${row.day} 的原件 ${objects.length} 个 · 释放 ${humanBytes(freed)}`})
          `;
        }
      }
    }
  } finally {
    running = false;
  }
  return stats;
}
