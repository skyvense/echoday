#!/usr/bin/env bash
# End-to-end check against a running stack: register, upload, Muse token, summary, search, 402.
set -euo pipefail
BASE="${1:-http://127.0.0.1:8080}"
EMAIL="smoke-$(date +%s)@example.com"
PASS="smoke-pass-123"
DAY="2026-10-23"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

python_json() {
  python3 -c 'import json,sys; print(json.load(sys.stdin)[sys.argv[1]])' "$1"
}

echo "register $EMAIL"
REG="$(curl -sf -c "$WORKDIR/cj" -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"client\":\"smoke\"}" \
  "$BASE/api/v1/auth/register")"
TOKEN="$(printf '%s' "$REG" | python_json token)"

SEG="$WORKDIR/rec_${DAY}_09-00-00.m4a"
dd if=/dev/zero bs=4096 count=1 of="$SEG" status=none 2>/dev/null
echo "upload segment"
curl -sf -X PUT "$BASE/api/v1/upload/${DAY}/rec_${DAY}_09-00-00.m4a" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: audio/mp4" \
  --data-binary @"$SEG" | python3 -m json.tool

printf '%s\n' \
  '{"ts":"2026-10-23T09:05:00+08:00","epoch_ms":1761185100000,"type":"meeting_start"}' \
  '{"ts":"2026-10-23T10:00:00+08:00","epoch_ms":1761188400000,"type":"meeting_end"}' \
  > "$WORKDIR/events.jsonl"
echo "upload markers"
curl -sf -X PUT "$BASE/api/v1/upload/markers/events-${DAY}.jsonl" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/x-ndjson" \
  --data-binary @"$WORKDIR/events.jsonl" | python3 -m json.tool

echo "create muse token"
MT="$(curl -sf -X POST "$BASE/api/v1/tokens" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"name":"smoke"}')"
MTOKEN="$(printf '%s' "$MT" | python_json token)"

echo "muse pull day"
curl -sf -H "Authorization: Bearer $MTOKEN" "$BASE/api/v1/muse/days/$DAY" | python3 -m json.tool > "$WORKDIR/day.json"
python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); assert d["audio"] and d["markers"][0]["type"]=="meeting_start"' "$WORKDIR/day.json"

echo "muse posts summary"
curl -sf -X PUT "$BASE/api/v1/muse/days/$DAY/summary" \
  -H "Authorization: Bearer $MTOKEN" \
  -H 'content-type: application/json' \
  -d '{"markdown":"# Smoke day\n\nMet in the morning about the shelf.","transcript_markdown":"hello shelf","source":"muse","model":"smoke"}' \
  | python3 -m json.tool

echo "search"
curl -sf -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/days?q=shelf" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["days"] and "shelf" in (d["days"][0]["summary_excerpt"] or "")'

echo "website day via cookie"
curl -sf -b "$WORKDIR/cj" "$BASE/api/v1/days/$DAY" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["summary"]["source"]=="muse"'

echo "muse token cannot upload"
CODE="$(curl -s -o "$WORKDIR/denied" -w '%{http_code}' -X PUT "$BASE/api/v1/upload/${DAY}/rec_${DAY}_09-00-00.m4a" \
  -H "Authorization: Bearer $MTOKEN" -H 'Content-Type: audio/mp4' --data-binary @"$SEG")"
test "$CODE" = "401"

if command -v docker >/dev/null 2>&1 && docker compose ps --status running postgres >/dev/null 2>&1; then
  echo "expire trial and expect 402"
  docker compose exec -T postgres psql -U "${POSTGRES_USER:-muse}" -d "${POSTGRES_DB:-muse}" \
    -c "update users set trial_ends_at = now() - interval '1 day', subscription_status = 'canceled' where email = '$EMAIL';" >/dev/null
  CODE="$(curl -s -o "$WORKDIR/pay" -w '%{http_code}' -X PUT "$BASE/api/v1/upload/${DAY}/note_${DAY}_11-00-00.m4a" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: audio/mp4' --data-binary @"$SEG")"
  test "$CODE" = "402"
  echo "read still works"
  curl -sf -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/days/$DAY" >/dev/null
fi

echo "logout revokes bearer"
curl -sf -b "$WORKDIR/cj" -c "$WORKDIR/cj" -X POST "$BASE/api/v1/auth/logout" >/dev/null
CODE="$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/me")"
test "$CODE" = "401"

echo "login again, extend trial, stub subscribe"
REL="$(curl -sf -c "$WORKDIR/cj" -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" \
  "$BASE/api/v1/auth/login")"
TOKEN="$(printf '%s' "$REL" | python_json token)"
curl -sf -X POST -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/billing/stub/trial" >/dev/null
curl -sf -X POST -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/billing/stub/activate" \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["billing"]["mode"]=="paid" and d["billing"]["upload"] is True'

echo "SMOKE OK $EMAIL"
