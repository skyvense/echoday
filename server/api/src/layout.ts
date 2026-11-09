const DATE = String.raw`\d{4}-\d{2}-\d{2}`;
const CLOCK = String.raw`\d{2}-\d{2}-\d{2}`;
const STAMP = `${DATE}_${CLOCK}`;

const AUDIO = new RegExp(`^(?<date>${DATE})/(?<filename>(?<kind>rec|note)_${STAMP}\\.m4a)$`);
const MARKERS = new RegExp(`^markers/(?<filename>events-(?<date>${DATE})\\.jsonl)$`);
const SNAP = new RegExp(
  `^snapshot-(?<date>${DATE})/(?<filename>snap_${STAMP}(?:_(?:back|front))?\\.jpg)$`,
);
const UNKNOWN = new RegExp(`^unknown-date/(?<filename>note_(?<date>${DATE})_${CLOCK}\\.m4a)$`);

export type ObjectKind = "segment" | "note" | "snapshot" | "markers";

export interface LogicalObject {
  logicalKey: string;
  day: string;
  filename: string;
  kind: ObjectKind;
  contentType: string;
}

function dateInAudioName(filename: string, kind: "rec" | "note"): string {
  const offset = kind === "note" ? 5 : 4;
  return filename.slice(offset, offset + 10);
}

/**
 * Accepts the same object keys muse-recorder writes to an S3 bucket.
 * See receiver/fetch_day_from_s3.py in skyvense/muse-recorder.
 */
export function parseLogicalKey(raw: string): LogicalObject | null {
  let key = raw.trim();
  try {
    key = decodeURIComponent(key);
  } catch {
    return null;
  }
  key = key.replace(/^\/+/, "");
  if (!key || key.includes("..") || key.includes("\\") || key.includes("\0")) return null;

  let match = AUDIO.exec(key);
  if (match?.groups) {
    const kindName = match.groups.kind === "note" ? "note" : "rec";
    if (dateInAudioName(match.groups.filename, kindName) !== match.groups.date) return null;
    return {
      logicalKey: key,
      day: match.groups.date,
      filename: match.groups.filename,
      kind: kindName === "note" ? "note" : "segment",
      contentType: "audio/mp4",
    };
  }

  match = MARKERS.exec(key);
  if (match?.groups) {
    return {
      logicalKey: key,
      day: match.groups.date,
      filename: match.groups.filename,
      kind: "markers",
      contentType: "application/x-ndjson",
    };
  }

  match = SNAP.exec(key);
  if (match?.groups) {
    if (match.groups.filename.slice(5, 15) !== match.groups.date) return null;
    return {
      logicalKey: key,
      day: match.groups.date,
      filename: match.groups.filename,
      kind: "snapshot",
      contentType: "image/jpeg",
    };
  }

  match = UNKNOWN.exec(key);
  if (match?.groups) {
    return {
      logicalKey: key,
      day: match.groups.date,
      filename: match.groups.filename,
      kind: "note",
      contentType: "audio/mp4",
    };
  }

  return null;
}

export interface ParsedMarker {
  line_no: number;
  ts: string | null;
  epoch_ms: number | null;
  type: string | null;
  raw: Record<string, unknown>;
}

export function parseMarkers(body: Buffer): ParsedMarker[] {
  const text = body.toString("utf8");
  const out: ParsedMarker[] = [];
  let lineNo = 0;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (lineNo >= 5000) break;
    lineNo += 1;
    try {
      const value = JSON.parse(trimmed) as unknown;
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const raw = value as Record<string, unknown>;
      const epoch = typeof raw.epoch_ms === "number" && Number.isFinite(raw.epoch_ms) ? Math.round(raw.epoch_ms) : null;
      out.push({
        line_no: lineNo,
        ts: typeof raw.ts === "string" ? raw.ts.slice(0, 80) : null,
        epoch_ms: epoch,
        type: typeof raw.type === "string" ? raw.type.slice(0, 80) : null,
        raw,
      });
    } catch {
      // A bad line must not drop the rest of the day. summarize_day.py does the same.
    }
  }
  return out;
}

export function isDay(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}
