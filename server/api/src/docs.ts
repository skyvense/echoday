import { env } from "./env.js";

export function apiDocs(): string {
  const base = env.publicUrl;
  return `# EchoDay API

This server stores audio, event markers, and the daily summary. It never calls a transcription or chat model. The phone uploads. Your Muse (or any BYOK agent) pulls a day, transcribes with your own key, and posts the summary back.

Base URL: ${base}

## Phone (user JWT)

Register or log in:

\`\`\`
POST ${base}/api/v1/auth/register
POST ${base}/api/v1/auth/login
Content-Type: application/json

{"email":"you@example.com","password":"at-least-8","client":"android"}
\`\`\`

The response includes \`token\`. Send \`Authorization: Bearer <token>\` on later calls. The website also sets an HttpOnly cookie.

Upload one object. The key is the same path muse-recorder writes to S3:

\`\`\`
PUT ${base}/api/v1/upload/YYYY-MM-DD/rec_YYYY-MM-DD_HH-mm-ss.m4a
PUT ${base}/api/v1/upload/YYYY-MM-DD/note_YYYY-MM-DD_HH-mm-ss.m4a
PUT ${base}/api/v1/upload/markers/events-YYYY-MM-DD.jsonl
PUT ${base}/api/v1/upload/snapshot-YYYY-MM-DD/snap_YYYY-MM-DD_HH-mm-ss_back.jpg
Authorization: Bearer <user token>
Content-Type: audio/mp4 | application/x-ndjson | image/jpeg
\`\`\`

Marker lines match the app:

\`\`\`
{"ts":"2026-10-23T09:05:00+08:00","epoch_ms":1761185100000,"type":"meeting_start"}
\`\`\`

Types: conversation_start, conversation_end, meeting_start, meeting_end, self_note, self_note_start, self_note_end, snapshot.

A re-PUT of the same key replaces the object. A re-PUT of the markers file replaces that day's events. Uploads return 402 when the trial has ended and there is no active subscription. Reads stay available.

## Website session

\`\`\`
GET  ${base}/api/v1/me
GET  ${base}/api/v1/days?q=
GET  ${base}/api/v1/days/YYYY-MM-DD
GET  ${base}/api/v1/days/YYYY-MM-DD/audio/<filename>
GET  ${base}/api/v1/days/YYYY-MM-DD/summary
PUT  ${base}/api/v1/days/YYYY-MM-DD/summary
\`\`\`

## Muse token

Create one while signed in on the website (or \`POST ${base}/api/v1/tokens\`). The raw token starts with \`muse_\` and is shown once.

Scopes: days:read, audio:read, markers:read, summary:read, summary:write.

\`\`\`
GET ${base}/api/v1/muse/days
GET ${base}/api/v1/muse/days/YYYY-MM-DD
GET ${base}/api/v1/muse/days/YYYY-MM-DD/segments/<filename>
GET ${base}/api/v1/muse/days/YYYY-MM-DD/snapshots/<filename>
GET ${base}/api/v1/muse/days/YYYY-MM-DD/markers
GET ${base}/api/v1/muse/days/YYYY-MM-DD/markers/raw
GET ${base}/api/v1/muse/days/YYYY-MM-DD/result
PUT ${base}/api/v1/muse/days/YYYY-MM-DD/result
PUT ${base}/api/v1/muse/days/YYYY-MM-DD/sheet
GET ${base}/api/v1/muse/days/YYYY-MM-DD/sheet
Authorization: Bearer muse_...
\`\`\`

The day manifest (\`GET .../days/YYYY-MM-DD\`) lists audio and snapshots with a ready-made \`download_url\` for each file, plus the parsed markers. \`.../result\` is the canonical name for the daily recognition result; \`.../summary\` is a legacy alias for the same payload and still works.

Result body (\`PUT .../result\`):

\`\`\`
{
  "markdown": "# 2026-10-23\\n\\n...",
  "transcript_markdown": "# transcript\\n\\n...",
  "analyses_json": [
    {"window_start": "2026-10-23 09:00", "window_end": "2026-10-23 13:00", "text": "..."}
  ],
  "photo_analysis_markdown": "...",
  "source": "muse",
  "model": "grok"
}
\`\`\`

\`markdown\` is required (max 200,000 chars). \`transcript_markdown\` max 2,000,000 chars, \`analyses_json\` is an array of at most 100 entries, \`photo_analysis_markdown\` max 200,000 chars, \`source\` is "muse" or "manual", \`model\` max 120 chars.

Daily activity sheet (\`PUT .../sheet\`): send the JPEG binary itself as the request body with \`Content-Type: image/jpeg\` — no JSON, no multipart.

## Retention and quota

Process new days promptly — originals do not stay forever:

- A day WITH a pushed result: its original audio and snapshot blobs are deleted 2 days after the result lands (paid plan: 30 days).
- A day WITHOUT a result: originals are deleted 7 days after that day's last upload (paid plan: 90 days).
- Markers, summaries/results, and sheet images are kept forever; only the original audio/photo blobs are removed.
- Originals quota: 2 GB on the free/trial plan, 20 GB paid. Uploads return 413 \`quota_exceeded\` when the quota is full, until processed days are cleaned up or the plan is upgraded.

Do the transcription on the machine that holds your key. Do not ask this server to transcribe.

Helper on the server host, or any machine with the token:

\`\`\`
MUSE_CLOUD_URL=${base} MUSE_API_TOKEN=muse_... \\
  python3 scripts/muse_cloud.py pull --date YYYY-MM-DD --base ~/muse-recordings
\`\`\`

That writes \`inbox/<date>/*.m4a\` and \`markers/events-<date>.jsonl\`, the same layout as \`fetch_day_from_s3.py\`. After you summarize with your own key, push the full result (summary + transcript + analyses + photo notes + sheet):

\`\`\`
MUSE_CLOUD_URL=${base} MUSE_API_TOKEN=muse_... \\
  python3 scripts/muse_cloud.py push-result --date YYYY-MM-DD --file summary.md \\
    --transcript transcript.md --analyses analyses.json \\
    --photo-analysis photo.md --sheet daily_sheet.jpg --model grok
\`\`\`

(\`push-summary\` still exists and posts only the summary/transcript to the legacy \`.../summary\` alias.)
`;
}
