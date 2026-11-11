"""Copy the live SCA Opportunities Sheet into opportunities.json.

opportunities.json is the backup that the career site, the chat and the
admin dashboard fall back to when the Sheet's Apps Script feed cannot be
reached. Run hourly by .github/workflows/sync-opportunities.yml so the
backup always matches the Sheet.

The file is only rewritten when the feed returns a sensible list, so a
Google outage or an empty sheet never wipes the backup.
"""

import json
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

FEED_URL = (
    "https://script.google.com/macros/s/"
    "AKfycbw18zxmzIiicaePtqdlds9-rioJVjBRXB5c-4wISad6qo7hGRCAnYF7hf-qp1MIeDgg"
    "/exec?action=opportunities"
)
OUT = Path(__file__).resolve().parent.parent / "opportunities.json"
MIN_ENTRIES = 3  # fewer than this is more likely a broken sheet than a real list


def fetch(url: str) -> object:
    req = urllib.request.Request(url, headers={"User-Agent": "sca-opportunities-sync"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.load(resp)


def entries_from(data: object) -> list:
    raw = data if isinstance(data, list) else (data or {}).get("opportunities")
    if not isinstance(raw, list):
        raise ValueError("feed has no opportunities list")
    rows = [e for e in raw if isinstance(e, dict) and str(e.get("title") or "").strip()]
    if len(rows) < MIN_ENTRIES:
        raise ValueError(f"feed returned only {len(rows)} opportunities; keeping the current backup")
    return rows


def main() -> int:
    try:
        rows = entries_from(fetch(FEED_URL))
    except Exception as e:  # network, JSON or sanity check
        print(f"::warning::Sheet not synced: {e}")
        return 0  # not a failure: the existing backup stays in place

    old_rows = None
    if OUT.exists():
        try:
            old_rows = json.loads(OUT.read_text()).get("opportunities")
        except Exception:
            pass
    if old_rows == rows:
        print(f"No change ({len(rows)} opportunities).")
        return 0

    payload = {
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "note": "Copied automatically from the SCA Opportunities Google Sheet every hour.",
        "opportunities": rows,
    }
    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    print(f"Updated opportunities.json: {len(rows)} opportunities.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
