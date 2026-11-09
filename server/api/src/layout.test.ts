import assert from "node:assert/strict";
import test from "node:test";
import { parseLogicalKey, parseMarkers } from "./layout.js";

test("accepts muse-recorder segment, note, marker, and snapshot keys", () => {
  const segment = parseLogicalKey("2026-10-23/rec_2026-10-23_14-00-00.m4a");
  assert.equal(segment?.kind, "segment");
  assert.equal(segment?.day, "2026-10-23");
  assert.equal(segment?.contentType, "audio/mp4");

  const note = parseLogicalKey("2026-10-23/note_2026-10-23_08-12-01.m4a");
  assert.equal(note?.kind, "note");

  const markers = parseLogicalKey("markers/events-2026-10-23.jsonl");
  assert.equal(markers?.kind, "markers");
  assert.equal(markers?.day, "2026-10-23");

  const snap = parseLogicalKey("snapshot-2026-10-23/snap_2026-10-23_14-02-11_back.jpg");
  assert.equal(snap?.kind, "snapshot");
  assert.equal(snap?.filename, "snap_2026-10-23_14-02-11_back.jpg");

  const front = parseLogicalKey("snapshot-2026-10-23/snap_2026-10-23_14-02-11_front.jpg");
  assert.equal(front?.kind, "snapshot");

  const rescued = parseLogicalKey("unknown-date/note_2026-10-23_08-12-01.m4a");
  assert.equal(rescued?.kind, "note");
  assert.equal(rescued?.day, "2026-10-23");
  assert.equal(rescued?.logicalKey, "unknown-date/note_2026-10-23_08-12-01.m4a");
});

test("rejects path traversal, mismatched dates, and unknown names", () => {
  assert.equal(parseLogicalKey("../etc/passwd"), null);
  assert.equal(parseLogicalKey("2026-10-23/../../secret.m4a"), null);
  assert.equal(parseLogicalKey("2026-10-24/rec_2026-10-23_14-00-00.m4a"), null);
  assert.equal(parseLogicalKey("2026-10-23/recording.mp3"), null);
  assert.equal(parseLogicalKey("markers/events-2026-10-23.txt"), null);
  assert.equal(parseLogicalKey("snapshot-2026-10-23/snap_2026-10-24_14-02-11_back.jpg"), null);
});

test("parses event jsonl and skips blank or broken lines", () => {
  const body = Buffer.from(
    [
      "",
      '{"ts":"2026-10-23T09:05:00+08:00","epoch_ms":1790000000000,"type":"meeting_start"}',
      "not-json",
      '{"ts":"2026-10-23T10:00:00+08:00","epoch_ms":1790003300000,"type":"meeting_end"}',
    ].join("\n"),
  );
  const markers = parseMarkers(body);
  assert.equal(markers.length, 2);
  assert.equal(markers[0]?.type, "meeting_start");
  assert.equal(markers[0]?.line_no, 1);
  assert.equal(markers[1]?.type, "meeting_end");
  assert.equal(markers[1]?.line_no, 3);
});
