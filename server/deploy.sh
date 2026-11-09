#!/usr/bin/env bash
# Muse AI Cloud — one-shot deploy, run ON the VPS inside this bundle's folder.
# Brings up postgres + minio + api + web via the bridge compose (web on 8471).
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "ERROR: .env missing in $(pwd)" >&2
  exit 1
fi

docker compose -f docker-compose.bridge.yml up -d --build

echo "Waiting for the API to become healthy via the web proxy..."
for i in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:8471/api/health >/dev/null 2>&1; then
    echo "OK — site is up: http://127.0.0.1:8471"
    echo "Optional full smoke test:  bash scripts/smoke.sh http://127.0.0.1:8471"
    exit 0
  fi
  sleep 3
done

echo "Health check did not pass. Last API/web logs:" >&2
docker compose -f docker-compose.bridge.yml logs --tail 50 api web >&2 || true
exit 1
