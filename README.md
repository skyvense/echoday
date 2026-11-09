# EchoDay

**Your day, echoed back.** EchoDay records your day in the background, and
*your own AI* turns it into a daily story — summaries, transcripts, photo
highlights — that you can read back any time.

The platform carries no model cost: recording and storage live here,
thinking lives with your agent.

## What's in this repo

| Part | Path | Stack |
| --- | --- | --- |
| API backend | `server/api/` | TypeScript, Hono, Postgres |
| Website | `server/web/` | React + Vite, served by nginx |
| Deployment | `server/docker-compose.yml`, `server/docker-compose.bridge.yml`, `server/deploy.sh` | Docker Compose |
| Android app | `android/` | Pure Java, no Gradle required (`build-apk.sh`) |
| Agent tooling | `server/scripts/muse_cloud.py` | Pull a day / push a result with a `muse_…` token |
| Product plan | `docs/PLAN.md` | Design notes |

## How it works

1. The Android app records in segments and uploads audio, event markers
   and auto-snapshots — either to **your own** R2 + Supabase
   (self-hosted mode) or to an **EchoDay server** (account mode).
   One `Backend` facade in the app hides the difference.
2. On the server, users register in the app (7-day trial, then a
   subscription). Uploads stop when a free account's 2 GB fills up —
   by design, so a daily processing habit forms.
3. The user hands a `muse_…` token to their own AI agent. The agent
   pulls each day, transcribes and summarises it locally, and pushes
   the result (summary, transcript, window analyses, photo findings
   and a daily activity sheet) back through the same API.
4. The app's Reports tab and the website read those results back.

## Quick start (server)

```bash
cd server
cp .env.example .env   # change every secret before going public
docker compose up -d --build
```

## Quick start (Android)

```bash
cd android
./build-apk.sh   # needs JDK 17 + Android SDK platform 34 / build-tools 34
```

The app ships as `personal.muse.recorder.cloud` with the launcher name
**Muse Daily Recorder Cloud**, so it installs alongside the personal
edition without touching its data.

## Status

Trial deployment is live; billing runs through Stripe with a local
stub for development.
