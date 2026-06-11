"""
World Cup settlement — grades PUBLIC (active) model picks from the official API-Football
FULL-TIME regulation score. 90-minute markets only; extra time / penalties are excluded (we
read `goals.home`/`goals.away`, which API-Football reports as the FT regulation result, not
AET/PEN). Market Outlook is informational and is NEVER settled.

Pure grading core (grade_moneyline / grade_total) is unit-tested; `main()` is the bounded
runner (one /fixtures call per finished match, only when status == FT). Idempotent: never alters
pre-game odds/lines, only appends graded results for finished matches.
"""
from __future__ import annotations

import argparse, json
from datetime import datetime, timezone
from pathlib import Path

from .providers.api_football import ApiFootballProvider

REPO = Path(__file__).resolve().parents[2]
DATA = REPO / "app" / "public" / "data" / "world-cup"
FINISHED = ("FT", "AET", "PEN")  # match is over; we still grade on regulation goals only


def grade_moneyline(pick_side: str, home_goals: int, away_goals: int) -> str:
    """Grade a 90-minute 3-way moneyline from the regulation score. Draw is a real outcome."""
    if home_goals > away_goals:
        result = "home"
    elif home_goals < away_goals:
        result = "away"
    else:
        result = "draw"
    return "win" if pick_side == result else "loss"


def grade_total(pick: str, line: float, home_goals: int, away_goals: int) -> str:
    """Grade an over/under total from regulation goals. `pick` ∈ {over, under}; .5 lines never push."""
    total = home_goals + away_goals
    if total == line:
        return "push"
    over = total > line
    if pick == "over":
        return "win" if over else "loss"
    return "win" if not over else "loss"


def _regulation_goals(fixture: dict) -> tuple[int, int] | None:
    """Regulation (FT) goals from an API-Football fixture, or None if not finished/parseable."""
    status = ((fixture.get("fixture") or {}).get("status") or {}).get("short")
    if status not in FINISHED:
        return None
    g = fixture.get("goals") or {}
    h, a = g.get("home"), g.get("away")
    if not isinstance(h, int) or not isinstance(a, int):
        return None
    return h, a


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", required=True)
    args = ap.parse_args(argv)
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    pf = DATA / "projections" / "latest.json"
    projections = json.loads(pf.read_text()).get("matches", []) if pf.exists() else []
    # ONLY grade parlay-eligible picks (the ones published as suggested legs) — never public-only
    # probability views, never research/gated, never the market outlook.
    gradeable = [p for p in projections if p.get("parlayEligible") is True and p.get("pick")]
    if not gradeable:
        print("[wc-settle] no public/active World Cup picks to settle — nothing graded")
        (DATA / "settlement").mkdir(parents=True, exist_ok=True)
        (DATA / "settlement" / "latest.json").write_text(json.dumps(
            {"generatedAt": now, "date": args.date, "graded": [], "note": "no public picks"}, indent=2) + "\n")
        return 0

    p = ApiFootballProvider()
    if not p.is_configured():
        print("[wc-settle] STOP API_FOOTBALL_KEY not set"); return 2
    fixture_cache, graded = {}, []
    for pick in gradeable:
        mid = pick.get("matchId")
        if mid is None:
            continue
        if mid not in fixture_cache:
            resp = (p._get("/fixtures", {"id": mid}) or {}).get("response", []) or []
            fixture_cache[mid] = resp[0] if resp else None
        fx = fixture_cache[mid]
        if not fx:
            continue
        reg = _regulation_goals(fx)
        if reg is None:
            continue  # not finished yet
        h, a = reg
        if pick["market"] == "moneyline_90":
            outcome = grade_moneyline(pick["pick"], h, a)
        elif pick["market"] == "match_total_goals":
            outcome = grade_total(pick["pick"], pick["line"], h, a)
        else:
            continue
        graded.append({"id": pick["id"], "market": pick["market"], "pick": pick.get("pickLabel"),
                       "regulationScore": f"{h}-{a}", "outcome": outcome})

    (DATA / "settlement").mkdir(parents=True, exist_ok=True)
    (DATA / "settlement" / "latest.json").write_text(json.dumps(
        {"generatedAt": now, "date": args.date, "calls": p.calls_made, "graded": graded}, indent=2) + "\n")
    print(f"[wc-settle] graded={len(graded)} calls={p.calls_made}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
