# APK integration

The phone uses a user JWT. A Muse token (`muse_…`) is a different credential and does not belong in the app.

Default deploy, host network:

| Surface | URL |
| --- | --- |
| Website and API prefix | `PUBLIC_URL`, default `http://127.0.0.1:8080` |
| API process | `http://127.0.0.1:8787` (nginx on 8080 proxies `/api`) |

The app should call the website origin, not port 8787, unless you are debugging the API directly on the same machine.

## Config keys

Store these in the app preferences. The patch in `android/` uses these names:

| Key | Preference | Meaning |
| --- | --- | --- |
| Base URL | `cloud_url` | `PUBLIC_URL` with no path. Example: `http://192.168.1.20:8080` |
| Email | `cloud_email` | Account email. Not a secret. |
| Session token | `cloud_token` | JWT from login. Send as `Authorization: Bearer`. |
| Backend | `upload_backend` | `cloud` or `s3`. |

Do not store the password. Do not store a `muse_` token in the phone.

Logout on the server increments `token_version`. Every JWT for that account, including one still saved on the phone, then returns 401. The app must delete `cloud_token` and sign in again.

## Auth

`Content-Type: application/json`

```bash
BASE=http://127.0.0.1:8080

curl -s -c cookies.txt -X POST "$BASE/api/v1/auth/register" \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"recorder1","client":"android"}'

curl -s -c cookies.txt -X POST "$BASE/api/v1/auth/login" \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"recorder1","client":"android"}'
```

Response:

```json
{ "token": "<jwt>", "user": { "email": "you@example.com", "billing": { "upload": true } } }
```

Later calls:

```http
Authorization: Bearer <jwt>
```

The website also sets cookie `muse_session`. The phone only needs the bearer token.

```bash
curl -s -X POST "$BASE/api/v1/auth/refresh" -H "Authorization: Bearer $TOKEN"
curl -s -X POST "$BASE/api/v1/auth/logout" -H "Authorization: Bearer $TOKEN"
curl -s "$BASE/api/v1/me" -H "Authorization: Bearer $TOKEN"
```

After logout, that same bearer receives 401. Register validation:

| Case | Status | `error` |
| --- | --- | --- |
| Bad email, or password shorter than 8 / missing a letter or number | 400 | `invalid_body` (`fields.email` or `fields.password`) |
| Email already registered | 409 | `email_taken` |
| Wrong password | 401 | `invalid_credentials` |

There is no password-change API. `POST /api/v1/auth/forgot` does not email a reset and does not change the password.

## Upload

Raw body, same object keys as muse-recorder’s S3 layout. Re-PUT replaces the object. Markers replace that day’s events.

```bash
DAY=2026-10-23
curl -s -X PUT "$BASE/api/v1/upload/$DAY/rec_${DAY}_09-00-00.m4a" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: audio/mp4' \
  --data-binary @rec.m4a

curl -s -X PUT "$BASE/api/v1/upload/$DAY/note_${DAY}_18-30-00.m4a" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: audio/mp4' \
  --data-binary @note.m4a

printf '%s\n' '{"ts":"2026-10-23T09:05:00+08:00","epoch_ms":1761185100000,"type":"meeting_start"}' \
  | curl -s -X PUT "$BASE/api/v1/upload/markers/events-$DAY.jsonl" \
      -H "Authorization: Bearer $TOKEN" \
      -H 'Content-Type: application/x-ndjson' \
      --data-binary @-

curl -s -X PUT "$BASE/api/v1/upload/snapshot-$DAY/snap_${DAY}_09-05-11_back.jpg" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: image/jpeg' \
  --data-binary @snap.jpg
```

Allowed names:

```text
YYYY-MM-DD/rec_YYYY-MM-DD_HH-mm-ss.m4a
YYYY-MM-DD/note_YYYY-MM-DD_HH-mm-ss.m4a
markers/events-YYYY-MM-DD.jsonl
snapshot-YYYY-MM-DD/snap_YYYY-MM-DD_HH-mm-ss_back.jpg
snapshot-YYYY-MM-DD/snap_YYYY-MM-DD_HH-mm-ss_front.jpg
```

HTTP 402 means uploads are closed (trial ended or subscription canceled). The body includes `billing_url`. Reads still work.

## List days

```bash
curl -s "$BASE/api/v1/days" -H "Authorization: Bearer $TOKEN"
curl -s "$BASE/api/v1/days/$DAY" -H "Authorization: Bearer $TOKEN"
curl -s "$BASE/api/v1/days?q=meeting" -H "Authorization: Bearer $TOKEN"
```

Audio for the signed-in user: `GET /api/v1/days/YYYY-MM-DD/audio/<filename>` with the same bearer or the session cookie. Range requests return 206.

## Platform config, R2, and Supabase

R2 and Supabase credentials are server environment variables. The APK never receives them. `503 storage_unconfigured` means `STORAGE_DRIVER=r2` is selected but the server is missing `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, or `R2_SECRET_ACCESS_KEY`.

```bash
curl -s "$BASE/api/v1/platform/config" -H "Authorization: Bearer $TOKEN"
```

```json
{
  "storage": { "driver": "s3", "ready": true },
  "supabase": { "enabled": false, "read_configured": false, "read_mode": "off", "linked": false },
  "upload": { "method": "PUT", "path": "/api/v1/upload/{key}", "authorization": "Bearer platform-jwt" }
}
```

Link a Supabase user only after the server sets `SUPABASE_INTEGRATION=enabled`. The body cannot choose the Supabase user id; the header must be that user's access token:

```bash
curl -s -X POST "$BASE/api/v1/platform/supabase/identity" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Supabase-Authorization: Bearer $SUPABASE_USER_ACCESS_TOKEN"
```

Reads (`GET /api/v1/platform/supabase/tables/<table>`) stay **503** `supabase_disabled` or `supabase_read_unconfigured` until the operator sets an allowlist whose owner column exists. The current Supabase project tables have no owner column and RLS is off; do not point the allowlist at them yet. Details: `docs/platform-r2-supabase.md`.
