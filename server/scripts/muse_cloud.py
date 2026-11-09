#!/usr/bin/env python3
"""Pull a EchoDay day into the muse-recorder inbox, or push a summary back.

Does not transcribe. Does not call OpenAI, Whisper, Grok, or any other model.
Point summarize_day.py at the inbox afterwards if you want a local transcript,
using a key that lives on this machine.

Environment:
  MUSE_CLOUD_URL    e.g. http://127.0.0.1:8080
  MUSE_API_TOKEN    muse_... token from the Connect page

Usage:
  python3 scripts/muse_cloud.py pull --date 2026-10-23 --base ~/muse-recordings
  python3 scripts/muse_cloud.py push-summary --date 2026-10-23 --file summary.md --model grok
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path


def base_url() -> str:
    url = os.environ.get("MUSE_CLOUD_URL", "").rstrip("/")
    if not url:
        sys.exit("Set MUSE_CLOUD_URL")
    return url


def token() -> str:
    raw = os.environ.get("MUSE_API_TOKEN", "").strip()
    if not raw.startswith("muse_"):
        sys.exit("Set MUSE_API_TOKEN to a muse_ token from the Connect page")
    return raw


def request(method: str, path: str, body: bytes | None = None, content_type: str | None = None) -> tuple[int, bytes]:
    req = urllib.request.Request(
        base_url() + path,
        data=body,
        method=method,
        headers={"Authorization": f"Bearer {token()}"},
    )
    if content_type:
        req.add_header("Content-Type", content_type)
    try:
        with urllib.request.urlopen(req, timeout=600) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")
        sys.exit(f"HTTP {exc.code} {path}: {detail}")


def pull(date: str, root: Path) -> None:
    status, payload = request("GET", f"/api/v1/muse/days/{date}")
    if status != 200:
        sys.exit(f"unexpected status {status}")
    day = json.loads(payload)
    inbox = root / "inbox" / date
    inbox.mkdir(parents=True, exist_ok=True)
    fetched = 0
    for item in day.get("audio", []):
        dest = inbox / item["filename"]
        if dest.exists() and dest.stat().st_size > 0:
            print(f"keep {dest}")
            continue
        _, data = request("GET", f"/api/v1/muse/days/{date}/segments/{item['filename']}")
        dest.write_bytes(data)
        fetched += 1
        print(f"fetched {item['filename']} ({len(data)} bytes)")
    markers = root / "markers" / f"events-{date}.jsonl"
    markers.parent.mkdir(parents=True, exist_ok=True)
    _, raw = request("GET", f"/api/v1/muse/days/{date}/markers/raw")
    markers.write_bytes(raw)
    print(f"fetched markers ({len(raw.splitlines())} lines) -> {markers}")
    for item in day.get("snapshots", []):
        dest = root / "snapshots" / date / item["filename"]
        dest.parent.mkdir(parents=True, exist_ok=True)
        if dest.exists() and dest.stat().st_size > 0:
            continue
        _, data = request("GET", f"/api/v1/muse/days/{date}/snapshots/{item['filename']}")
        dest.write_bytes(data)
        print(f"fetched {item['filename']} ({len(data)} bytes)")
    print(f"DONE {date}: {fetched} new audio files, {len(day.get('audio', []))} listed")


def push_summary(date: str, summary: Path, transcript: Path | None, model: str) -> None:
    body = {
        "markdown": summary.read_text(encoding="utf-8"),
        "source": "muse",
        "model": model,
    }
    if transcript:
        body["transcript_markdown"] = transcript.read_text(encoding="utf-8")
    _, payload = request(
        "PUT",
        f"/api/v1/muse/days/{date}/summary",
        json.dumps(body).encode(),
        "application/json",
    )
    print(payload.decode())


def push_result(
    date: str,
    summary: Path,
    transcript: Path | None,
    photo_analysis: Path | None,
    analyses: Path | None,
    sheet: Path | None,
    model: str,
) -> None:
    """Push the full daily recognition result: audio summary + photo findings."""
    body: dict = {
        "markdown": summary.read_text(encoding="utf-8"),
        "source": "muse",
        "model": model,
    }
    if transcript:
        body["transcript_markdown"] = transcript.read_text(encoding="utf-8")
    if photo_analysis:
        body["photo_analysis_markdown"] = photo_analysis.read_text(encoding="utf-8")
    if analyses:
        body["analyses_json"] = json.loads(analyses.read_text(encoding="utf-8"))
    _, payload = request(
        "PUT",
        f"/api/v1/muse/days/{date}/result",
        json.dumps(body).encode(),
        "application/json",
    )
    print(payload.decode())
    if sheet:
        _, payload = request(
            "PUT",
            f"/api/v1/muse/days/{date}/sheet",
            sheet.read_bytes(),
            "image/jpeg",
        )
        print(payload.decode())


def main() -> int:
    parser = argparse.ArgumentParser(description="EchoDay pull / summary push. No transcription.")
    sub = parser.add_subparsers(dest="cmd", required=True)

    pull_cmd = sub.add_parser("pull")
    pull_cmd.add_argument("--date", required=True)
    pull_cmd.add_argument("--base", default=os.path.expanduser("~/muse-recordings"))

    push_cmd = sub.add_parser("push-summary")
    push_cmd.add_argument("--date", required=True)
    push_cmd.add_argument("--file", required=True, type=Path)
    push_cmd.add_argument("--transcript", type=Path)
    push_cmd.add_argument("--model", default="byok")

    result_cmd = sub.add_parser("push-result")
    result_cmd.add_argument("--date", required=True)
    result_cmd.add_argument("--file", required=True, type=Path)
    result_cmd.add_argument("--transcript", type=Path)
    result_cmd.add_argument("--photo-analysis", type=Path)
    result_cmd.add_argument("--analyses", type=Path, help="JSON array of per-window analyses")
    result_cmd.add_argument("--sheet", type=Path, help="Daily activity sheet JPEG (~1 MB)")
    result_cmd.add_argument("--model", default="byok")

    args = parser.parse_args()
    if args.cmd == "pull":
        pull(args.date, Path(args.base))
    elif args.cmd == "push-result":
        push_result(
            args.date,
            args.file,
            args.transcript,
            args.photo_analysis,
            args.analyses,
            args.sheet,
            args.model,
        )
    else:
        push_summary(args.date, args.file, args.transcript, args.model)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
