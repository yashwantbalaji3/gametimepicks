"""
build_ops_status — rolling UFC operations dashboard artifact. Derives the current
launch STAGE + validation progress from the real readiness/backtest/schedule
artifacts so /ufc can show a live, honest status. No picks, no fabrication.

Run: python -m pipeline.ufc.build_ops_status
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA = REPO_ROOT / "app" / "public" / "data" / "ufc"
OUT = DATA / "ops-status-latest.json"
TARGET_ROWS_PUBLIC_MONEYLINE = 150


def _load(name):
    try:
        return json.loads((DATA / name).read_text())
    except Exception:
        return {}


def build(now: datetime | None = None) -> dict:
    ref = now or datetime.now(timezone.utc)
    rd = _load("readiness-latest.json")
    bt = _load("backtest-summary-latest.json")
    sched = _load("schedule-latest.json")
    odds = _load("odds-latest.json")
    res = _load("results-latest.json")

    sR = bool(rd.get("scheduleReady")); oR = bool(rd.get("oddsReady"))
    fR = bool(rd.get("fighterStatsReady")); gR = bool(rd.get("gradingReady"))
    bR = bool(rd.get("backtestReady")); pR = bool(rd.get("parlaySimReady"))
    clean_rows = bt.get("rowCount", 0)

    if bR and pR:
        stage, stage_name = 3, "Public moneyline parlays"
    elif bR:
        stage, stage_name = 2, "Public moneyline projections"
    elif sR and oR and fR and gR:
        stage, stage_name = 1, "Internal moneyline model (public locked)"
    elif sR and oR:
        stage, stage_name = 0, "Public odds board"
    else:
        stage, stage_name = -1, "Setup"

    blockers, next_actions = [], []
    if not bR:
        blockers.append(f"backtest: {clean_rows}/{TARGET_ROWS_PUBLIC_MONEYLINE} clean graded rows")
        next_actions.append("run ufc-pre-card before each card (logs pregame snapshot), ufc-post-card after (grades + accumulates)")
    if not pR:
        blockers.append("parlay simulation not yet run")
    props = rd.get("propMarketsAvailable") or {"method": False, "distance": False, "rounds": False}
    if not any(v for k, v in props.items() if k != "h2h"):
        blockers.append("no prop markets from current sportsbook feed (The Odds API MMA = h2h only)")
        next_actions.append("connect a prop-odds provider (see ufc-prop-odds-provider-search) to unlock method/distance/round")

    return {
        "generatedAt": ref.isoformat(timespec="seconds"),
        "currentStage": stage,
        "currentStageName": stage_name,
        "nextCard": {"eventName": sched.get("eventName"), "eventDate": sched.get("eventDate"),
                     "fightCount": sched.get("fightCount"), "isRealCard": sched.get("isRealCard")},
        "scheduleStatus": "ready" if sR else "pending",
        "oddsStatus": "ready" if oR else "pending",
        "fighterStatsStatus": "ready" if fR else "pending",
        "gradingStatus": "ready" if gR else "pending",
        "backtestStatus": "ready" if bR else "collecting",
        "parlaySimStatus": "ready" if pR else "pending",
        "cleanGradedRows": clean_rows,
        "targetRowsForPublicMoneyline": TARGET_ROWS_PUBLIC_MONEYLINE,
        "latestPregameSnapshotAt": odds.get("generatedAt"),
        "latestResultsRefreshAt": res.get("generatedAt"),
        "latestBacktestRunAt": bt.get("generatedAt"),
        "propMarketStatus": {"method": "unavailable", "distance": "unavailable", "rounds": "unavailable",
                             "note": "Not offered by the current sportsbook feed (The Odds API MMA = h2h only)."},
        "publicPicksVisible": bool(rd.get("projectionsReady")),
        "blockers": blockers,
        "nextActions": next_actions,
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(); ap.add_argument("--out", default=str(OUT)); args = ap.parse_args(argv)
    payload = build()
    Path(args.out).write_text(json.dumps(payload, indent=2) + "\n")
    print(f"wrote {args.out} → stage={payload['currentStage']} ({payload['currentStageName']}) "
          f"cleanRows={payload['cleanGradedRows']}/{payload['targetRowsForPublicMoneyline']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
