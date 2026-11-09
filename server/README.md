# Muse AI Cloud

Self-hosted shelf for [Muse Daily Recorder](https://github.com/skyvense/muse-recorder). The phone uploads each finished hour of audio and the day's event markers. The website shows days, markers, and the summary. Your own Muse (or any BYOK agent) pulls a day, transcribes it with **your** key, and posts the summary back.

This server never calls OpenAI, Whisper, Grok, or any other model. There is no server-side transcription key to set.

Access is **$5 USD per user per month** after a 7-day trial. Without Stripe keys the billing page runs a local stub so you can try the paid and read-only states. Nothing is charged until you add your own Stripe test or live keys.

## Quick start

```bash
cp .env.example .env
docker compose up --build
```

`docker-compose.yml` uses host networking so it still runs when dockerd was started with `--iptables=false`. The website is on port **8080**. The API listens on **127.0.0.1:8787** and nginx proxies `/api` to it.

Optional bridge networking publishes the website on port **8471** instead:

```bash
docker compose -f docker-compose.bridge.yml up --build
```

Open [http://127.0.0.1:8080](http://127.0.0.1:8080), create an account, and uploads are open for 7 days.

Check the whole path (register, upload, Muse token, summary, search):

```bash
bash scripts/smoke.sh http://127.0.0.1:8080
```

Simulate one segment yourself:

```bash
EMAIL=you@example.com
# Use the token printed by login. The website also keeps an HttpOnly cookie.
TOKEN=$(curl -s http://127.0.0.1:8080/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"your-password\"}" | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')

DAY=2026-10-23
dd if=/dev/zero bs=4096 count=1 of=/tmp/rec.m4a
curl -X PUT "http://127.0.0.1:8080/api/v1/upload/$DAY/rec_${DAY}_09-00-00.m4a" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: audio/mp4' \
  --data-binary @/tmp/rec.m4a

printf '%s\n' '{"ts":"2026-10-23T09:05:00+08:00","epoch_ms":1761185100000,"type":"meeting_start"}' \
  | curl -X PUT "http://127.0.0.1:8080/api/v1/upload/markers/events-$DAY.jsonl" \
      -H "Authorization: Bearer $TOKEN" \
      -H 'Content-Type: application/x-ndjson' \
      --data-binary @-
```

The day shows up under **Days**. Create a Muse token under **Connect Muse** and post a summary:

```bash
export MUSE_CLOUD_URL=http://127.0.0.1:8080
export MUSE_API_TOKEN=muse_...
python3 scripts/muse_cloud.py pull --date 2026-10-23 --base /tmp/muse-recordings
python3 scripts/muse_cloud.py push-summary --date 2026-10-23 --file summary.md --model grok
```

`pull` writes `inbox/<date>/*.m4a` and `markers/events-<date>.jsonl`, the same layout as muse-recorder's `receiver/fetch_day_from_s3.py`. The script does not transcribe. Run transcription on the machine that holds your key, then `push-summary`.

## What is in the stack

| Service | Role | Published port |
| --- | --- | --- |
| `web` | Nginx, the React UI, and a reverse proxy for `/api` | **8080** (host network) |
| `api` | Node + Hono. Auth, uploads, days, Muse tokens, Stripe | **127.0.0.1:8787** |
| `postgres` | Accounts, days, markers, summaries | not published |
| `minio` | Audio and marker blobs (Silo, S3-compatible; the old `minio/minio` image is no longer published) | `127.0.0.1:9000` and console `9001` |

Set `STORAGE_DRIVER=fs` in `.env` to keep blobs on the `muse_blobs` volume instead of MinIO. The API still creates the MinIO bucket when the driver is `s3`.

Change `JWT_SECRET`, `POSTGRES_PASSWORD`, and the MinIO keys before anyone else can reach the machine. The example secret contains `change-me` on purpose; the API logs a warning until you replace it.

## Environment

See `.env.example`. The important ones:

| Variable | Meaning |
| --- | --- |
| `PUBLIC_URL` | External origin, no trailing slash. Used for Stripe return URLs and the Connect page. |
| `JWT_SECRET` | Signs phone and browser sessions. 16+ characters. |
| `TRIAL_DAYS` | Full upload access from registration. Default 7. |
| `PRICE_CENTS` | Shown in the UI. Default 500. Stripe still uses `STRIPE_PRICE_ID` for the real charge. |
| `STORAGE_DRIVER` | `s3` (local Silo/MinIO), `fs`, or `r2` (Cloudflare R2; server-only `R2_*` vars). |
| `BILLING_MODE` | `auto` (Stripe if the secret and price id are set, otherwise stub), `stripe`, or `stub`. |
| `STRIPE_SECRET_KEY` | `sk_test_…` or `sk_live_…`. Empty means the local stub. |
| `STRIPE_PRICE_ID` | Recurring price of $5/month. |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for `POST /api/v1/billing/webhook`. |

## Stripe test setup

No live keys ship with this repo. Leave the three Stripe variables empty and billing stays a local stub.

### Stub (keys absent)

`BILLING_MODE=auto` with empty `STRIPE_SECRET_KEY` or `STRIPE_PRICE_ID` selects stub. Nothing is charged.

1. Register. Uploads work for `TRIAL_DAYS` (7).
2. Billing → **Start or extend 7-day trial** calls `POST /api/v1/billing/stub/trial` and moves `trial_ends_at` forward. No card.
3. **Subscribe $5/mo (stub)** calls `POST /api/v1/billing/stub/activate` and sets `subscription_status=active`.
4. **Cancel test subscription** returns the account to the trial if it is still open, otherwise uploads become read-only.

### Real Stripe test mode

1. Create a recurring price of **500 USD cents** per month:

```bash
stripe products create --name "Muse AI Cloud"
stripe prices create --unit-amount 500 --currency usd \
  -d "recurring[interval]=month" --product prod_...
```

2. Put these in `.env` and recreate the API container:

| Variable | Example |
| --- | --- |
| `BILLING_MODE` | `stripe` or `auto` |
| `STRIPE_SECRET_KEY` | `sk_test_…` |
| `STRIPE_PRICE_ID` | `price_…` from the command above |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` from `stripe listen` |
| `PUBLIC_URL` | `http://127.0.0.1:8080` or your https origin |

3. Forward webhooks to the website, which proxies to the API:

```bash
stripe listen --forward-to 127.0.0.1:8080/api/v1/billing/webhook
```

The handler verifies `Stripe-Signature` and applies `checkout.session.completed` plus `customer.subscription.created`, `updated`, and `deleted`.

4. In the app, **Subscribe · $5/mo** opens Checkout. Test card `4242 4242 4242 4242`. If more than 48 hours of trial remain, Checkout keeps that trial end so the card is not charged for the same window. Enable the Customer Portal in the Dashboard once; **Open customer portal** appears after a real Stripe customer exists.

Signing out revokes the bearer JWT (`users.token_version` increments). Clearing the cookie alone is not the whole logout. There is no password-change endpoint. After the trial or a canceled subscription, uploads return **402** and the archive stays readable.

R2 and Supabase are optional server integrations. The Android app still uses only the platform JWT. See `docs/platform-r2-supabase.md` and `docs/apk-integration.md`. Supabase reads are disabled until `SUPABASE_INTEGRATION=enabled` and an allowlist names an owner column. The connected project’s current public tables have no owner column and RLS is off; do not query them from the API until that is fixed. No change was applied to that Supabase project.

## VPS

One machine is enough. Do not publish Postgres or MinIO.

```bash
git clone <this repo> /opt/muse-ai-cloud
cd /opt/muse-ai-cloud
cp .env.example .env
# edit PUBLIC_URL=https://cloud.example.com, JWT_SECRET, passwords, Stripe
docker compose up -d --build
```

The UI listens on port **8080**. The API listens on **127.0.0.1:8787** and is not meant to be public. Put TLS in front of 8080 and leave 5432 and 9000 on localhost only.

### Caddy

```caddy
cloud.example.com {
  reverse_proxy 127.0.0.1:8080
}
```

Set `PUBLIC_URL=https://cloud.example.com` and `COOKIE_SECURE=true`.

### nginx

```nginx
server {
  listen 443 ssl;
  server_name cloud.example.com;
  client_max_body_size 100m;

  # ssl_certificate / ssl_certificate_key ...

  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto https;
    proxy_read_timeout 600s;
    proxy_request_buffering off;
  }
}
```

Backups that matter: the `muse_pg` volume and either `muse_minio` or `muse_blobs`, depending on `STORAGE_DRIVER`.

## Point the phone at the server

muse-recorder talks to S3 today. This repo ships a patch so a build of that app can log in here instead. See [android/MERGE.md](android/MERGE.md).

```bash
git clone https://github.com/skyvense/muse-recorder.git
cd muse-recorder
patch -p1 < /opt/muse-ai-cloud/android/muse-cloud.patch
./build-apk.sh
```

On the phone: menu → **Muse Cloud** → server `https://cloud.example.com` → the website email and password. Recording, 60-minute segments, markers, and Wi-Fi-only upload behave as they do now. The object keys do not change:

```text
YYYY-MM-DD/rec_YYYY-MM-DD_HH-mm-ss.m4a
YYYY-MM-DD/note_YYYY-MM-DD_HH-mm-ss.m4a
markers/events-YYYY-MM-DD.jsonl
snapshot-YYYY-MM-DD/snap_YYYY-MM-DD_HH-mm-ss_back.jpg
```

Marker lines are the app's JSONL:

```json
{"ts":"2026-10-23T09:05:00+08:00","epoch_ms":1761185100000,"type":"meeting_start"}
```

`conversation_start`, `conversation_end`, `meeting_start`, `meeting_end`, `self_note`, `self_note_start`, `self_note_end`, `snapshot`.

A full APK is not built in this repo. `android/settings-mock.html` is a picture of the new screen, and `android/muse-cloud.patch` is the diff.

## Connect Muse or another BYOK agent

On **Connect Muse**, create a token. It is shown once and stored as a hash. Paste this to the agent, with the real token and yesterday's date:

```text
Each morning, pull yesterday from my Muse AI Cloud and write the daily summary.
Base URL: https://cloud.example.com
Authorization: Bearer muse_...

This server does not transcribe. Download the audio and transcribe it with my key.
GET  /api/v1/muse/days/YYYY-MM-DD
GET  each audio download_url
PUT  /api/v1/muse/days/YYYY-MM-DD/summary
     {"markdown":"...","transcript_markdown":"...","source":"muse","model":"grok"}
```

The same instructions are on the Connect page and at `GET /api/v1/docs`.

Scopes on a new token: `days:read`, `audio:read`, `markers:read`, `summary:read`, `summary:write`. Revoke a token from the same page; the next call fails immediately.

## API map

| Call | Auth | Purpose |
| --- | --- | --- |
| `POST /api/v1/auth/register` and `/login` | body | Returns a JWT. Also sets cookie `muse_session`. |
| `GET /api/v1/me` | user | Account and billing state. |
| `PUT /api/v1/upload/<s3-key>` | user | Segment, note, markers, or snapshot. 402 when uploads are closed. |
| `GET /api/v1/days?q=` | user | Day list and search across summaries, markers, filenames. |
| `GET /api/v1/days/:date` | user | Segments, markers, summary. |
| `PUT /api/v1/days/:date/summary` | user | Edit the summary from the website. |
| `POST /api/v1/tokens` | user | Create a Muse token. |
| `GET /api/v1/muse/days/:date` | `muse_` | Manifest with download URLs. |
| `PUT /api/v1/muse/days/:date/summary` | `muse_` | Agent posts the daily note. |
| `POST /api/v1/billing/checkout` | user | Stripe Checkout, or a stub explanation. |
| `POST /api/v1/billing/portal` | user | Stripe Customer Portal. |
| `POST /api/v1/billing/webhook` | Stripe signature | Subscription updates. |

Audio responses honor `Range`, so the browser player can seek.

## Local development without compose

You still need Postgres and, if `STORAGE_DRIVER=s3`, MinIO. Then:

```bash
cd api && npm install && npm test && npm run dev
cd web && npm install && npm run dev
```

The Vite server on port 5174 proxies `/api` to `127.0.0.1:8787`. Set `DATABASE_URL` to a host Postgres before starting the API.

## Layout of this repo

```text
api/          Hono API
web/          React UI
android/      Patch and settings mock for muse-recorder
scripts/      smoke.sh and muse_cloud.py
```
