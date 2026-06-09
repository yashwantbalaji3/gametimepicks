"""
build_schedule — fetch the REAL upcoming UFC card from the free ESPN MMA API
(source of truth) and normalize it. Schedule precedes odds: futures/hypothetical
OddsAPI matchups are NOT a card. Fail-closed: duplicate-fighter/no-source → blocked.
Uses stdlib urllib (no key, no extra deps).

Run: python -m pipeline.ufc.build_schedule
"""
from __future__ import annotations

import argparse
import json
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from .build_fighter_stats import _norm_name

REPO_ROOT = Path(__file__).resolve().parents[2]
OUT = REPO_ROOT / "app" / "public" / "data" / "ufc" / "schedule-latest.json"
ESPN_URL = "https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard"
SOURCE = "espn_mma"


def fetch_scoreboard(url: str = ESPN_URL) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "gametimepicks-ufc/1.0"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode("utf-8"))


def _state(c: dict) -> str:
    st = (c.get("status") or {}).get("type", {}).get("state") or \
         (c.get("status") or {}).get("type", {}).get("name", "")
    return {"pre": "scheduled", "in": "in_progress", "post": "final"}.get(st, st or "unknown")


def build(scoreboard: dict, now: datetime | None = None) -> dict:
    ref = now or datetime.now(timezone.utc)
    events = scoreboard.get("events", []) or []
    # nearest upcoming event
    events = sorted(events, key=lambda e: e.get("date") or "")
    upcoming = next((e for e in events if (e.get("status") or {}).get("type", {}).get("state") == "pre"), events[0] if events else None)
    if not upcoming:
        return {"generatedAt": ref.isoformat(timespec="seconds"), "source": SOURCE,
                "isRealCard": False, "fights": [], "blockers": ["no UFC event from ESPN"]}

    fights, blockers = [], []
    name_counts = Counter()
    raw = []
    for c in upcoming.get("competitions", []) or []:
        cs = c.get("competitors", []) or []
        names = [((x.get("athlete") or {}).get("displayName")) for x in cs]
        names = [n for n in names if n]
        if len(names) != 2:
            blockers.append({"bout": names, "reason": "not a two-fighter bout"})
            continue
        for n in names:
            name_counts[_norm_name(n)] += 1
        raw.append((c, names))
    for c, names in raw:
        # futures guard: a fighter listed in >1 bout on the same card → block
        if name_counts[_norm_name(names[0])] > 1 or name_counts[_norm_name(names[1])] > 1:
            blockers.append({"bout": names, "reason": "duplicate fighter on card (futures/hypothetical)"})
            continue
        fights.append({
            "boutId": f"{(upcoming.get('date') or '')[:10]}:{'|'.join(sorted([_norm_name(names[0]), _norm_name(names[1])]))}",
            "fighterA": names[0], "fighterB": names[1],
            "weightClass": (c.get("type") or {}).get("text") or None,
            "status": _state(c),
            "source": SOURCE, "warnings": [],
        })
    is_real = len(fights) >= 3 and not any(name_counts[k] > 1 for k in name_counts)
    return {
        "generatedAt": ref.isoformat(timespec="seconds"),
        "source": SOURCE, "sourceUrl": ESPN_URL,
        "eventId": upcoming.get("id"),
        "eventName": upcoming.get("name"),
        "eventDate": upcoming.get("date"),
        "venue": ((upcoming.get("competitions") or [{}])[0].get("venue") or {}).get("fullName"),
        "fightCount": len(fights),
        "isRealCard": is_real,
        "fights": fights,
        "blockers": blockers,
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(); ap.add_argument("--out", default=str(OUT)); args = ap.parse_args(argv)
    try:
        sb = fetch_scoreboard()
    except Exception as e:
        payload = {"generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                   "source": SOURCE, "isRealCard": False, "fights": [],
                   "blockers": [f"ESPN fetch failed: {type(e).__name__}"]}
    else:
        payload = build(sb)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(payload, indent=2) + "\n")
    print(f"wrote {args.out} → event={payload.get('eventName')} fights={payload.get('fightCount')} isRealCard={payload.get('isRealCard')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
