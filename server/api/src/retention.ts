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
// - A day WITH a result (a summaries row): the result "landed" at
//   summaries.updated_at — every result/summary re-push refreshes it, so
//   an actively re-worked day is not cut mid-flight. Originals are deleted
//   once that is older than 2 days (free) / 30 days (paid).
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
  if (candidate.hasResult) {
    return candidate.paid ? env.retentionProcessedPaidDays : env.retentionProcessedFreeDays;
  }
  return candidate.paid ? env.retentionUnprocessedPaidDays : env.retentionUnprocessedFreeDays;
}

export function retentionDue(candidate: RetentionCandidate, now: Date): boolean {
  const ageMs = now.getTime() - new Date(candidate.anchorAt).getTime();
  return ageMs >= retentionLimitDays(candidate) * 24 * 60 * 60 * 1000;
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
      }
    }
  } finally {
    running = false;
  }
  return stats;
}
