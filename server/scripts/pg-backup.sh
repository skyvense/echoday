#!/usr/bin/env bash
# EchoDay Postgres backup — run ON the VPS inside /opt/muse-ai-cloud.
#
# What it does:
#   1. pg_dump the `muse` database out of the compose `postgres` service
#   2. gzip it to /root/backups/echoday-pg-YYYYMMDD-HHMMSS.sql.gz
#   3. verify the gzip integrity and that the dump is non-empty
#   4. keep the newest 7 dumps, delete older ones (DB is text-only
#      summaries/markers, so each dump is small; 7 days is plenty on
#      the 11 GB disk)
#
# Deploy (on the VPS, as root):
#   cp scripts/pg-backup.sh /opt/muse-ai-cloud/scripts/pg-backup.sh
#   chmod +x /opt/muse-ai-cloud/scripts/pg-backup.sh
#   (crontab -l 2>/dev/null; echo "30 3 * * * /bin/bash /opt/muse-ai-cloud/scripts/pg-backup.sh >> /root/backups/backup.log 2>&1") | crontab -
#   # then run once by hand and check the log:
#   /bin/bash /opt/muse-ai-cloud/scripts/pg-backup.sh
#   ls -lh /root/backups/ | tail -3
#
# Restore check (does not touch the live DB):
#   gunzip -c /root/backups/<file>.sql.gz | docker compose -f docker-compose.bridge.yml exec -T postgres pg_restore -l - | head
# Full restore is a separate, deliberate operation — see server README.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/muse-ai-cloud}"
BACKUP_DIR="${BACKUP_DIR:-/root/backups}"
KEEP="${KEEP:-7}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.bridge.yml}"
DRY_RUN="${DRY_RUN:-0}"

mkdir -p "$BACKUP_DIR"
cd "$APP_DIR"

# Load DB credentials from the VPS .env (same file deploy.sh uses).
# Defaults match docker-compose.bridge.yml when a key is absent.
set -a
# shellcheck disable=SC1091
[ -f .env ] && . ./.env
set +a
POSTGRES_USER="${POSTGRES_USER:-muse}"
POSTGRES_DB="${POSTGRES_DB:-muse}"

TS="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/echoday-pg-$TS.sql.gz"

DUMP_CMD=(docker compose -f "$COMPOSE_FILE" exec -T
  -e "PGPASSWORD=${POSTGRES_PASSWORD:-muse_dev_password}"
  postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB")

if [ "$DRY_RUN" = "1" ]; then
  echo "DRY RUN — would execute:"
  echo "  ${DUMP_CMD[*]} | gzip > $OUT"
  echo "  gzip -t $OUT && test -s $OUT"
  echo "  keep newest $KEEP dumps in $BACKUP_DIR"
  exit 0
fi

"${DUMP_CMD[@]}" | gzip > "$OUT"

# Verify: gzip integrity + non-empty + looks like a pg_dump.
# (Decompress to a temp file first: piping gzip straight into head/grep
# would SIGPIPE under `set -o pipefail` and fail even a good dump.)
gzip -t "$OUT"
test -s "$OUT"
TMP_CHECK="$(mktemp)"
trap 'rm -f "$TMP_CHECK"' EXIT
gzip -dc "$OUT" > "$TMP_CHECK"
if ! grep -q "PostgreSQL database dump" "$TMP_CHECK"; then
  echo "ERROR: $OUT does not look like a pg_dump" >&2
  exit 1
fi

# Rotate: keep newest $KEEP.
# (ls -t lists newest first; tail drops the keepers.)
# shellcheck disable=SC2012
ls -t "$BACKUP_DIR"/echoday-pg-*.sql.gz | tail -n +"$((KEEP + 1))" | xargs -r rm --

SIZE="$(du -h "$OUT" | cut -f1)"
echo "$(date '+%Y-%m-%d %H:%M:%S') backup OK: $OUT ($SIZE), kept newest $KEEP"
