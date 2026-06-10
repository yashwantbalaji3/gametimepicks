"""
build_world_cup_readiness — fail-closed readiness for FIFA World Cup 2026. Derives
gates from the REAL committed structural data (schedule/teams/groups). Odds, stats,
grading, projections, and parlays stay FALSE until real providers are connected — no
fake matches, odds, teams, or projections. Mirrors the MLB/NBA/UFC fail-closed pattern;
kept fully independent so a World Cup gap never affects other sports.

Run: python -m pipeline.build_world_cup_readiness
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
DATA = REPO_ROOT / "app" / "public" / "data" / "world-cup"
OUT = DATA / "readiness-latest.json"


def _load(name):
    try:
        return json.loads((DATA / name).read_text())
    except Exception:
        return None


def _count(obj, *keys):
    if isinstance(obj, list):
        return len(obj)
    if isinstance(obj, dict):
        for k in keys:
            v = obj.get(k)
            if isinstance(v, list):
                return len(v)
    return 0


def derive(now: datetime | None = None) -> dict:
    ref = now or datetime.now(timezone.utc)
    sched = _load("schedule.json"); teams = _load("teams.json")
    groups = _load("groups.json"); squads = _load("squads.json")

    match_count = _count(sched, "matches", "fixtures")
    team_count = _count(teams, "teams")
    group_count = _count(groups, "groups")
    # squads intentionally withheld until federations release official 26-man rosters
    squads_published = bool(squads and _count(squads, "squads", "teams") > 0)

    schedule_ready = match_count > 0
    teams_ready = team_count > 0
    # Everything below needs a real provider that does not exist yet → fail-closed.
    odds_ready = False
    stats_ready = False
    grading_ready = False
    backtest_ready = False
    # Derived gates (never true while inputs are false).
    projections_ready = schedule_ready and teams_ready and odds_ready and stats_ready
    parlay_ready = projections_ready and grading_ready and backtest_ready

    blockers = []
    if not odds_ready:
        blockers.append("no soccer odds provider connected (match + player-prop markets)")
    if not stats_ready:
        blockers.append("no team/player stats provider connected (form, lineups, xG)")
    if not grading_ready:
        blockers.append("no settlement/grading source defined for soccer markets")

    if parlay_ready:
        level = "parlays-public"
    elif projections_ready:
        level = "projections-public"
    elif schedule_ready:
        level = "schedule-only"
    else:
        level = "setup"

    return {
        "generatedAt": ref.isoformat(timespec="seconds"),
        "sport": "fifa-world-cup-2026",
        "scheduleReady": schedule_ready,
        "teamsReady": teams_ready,
        "oddsReady": odds_ready,
        "statsReady": stats_ready,
        "gradingReady": grading_ready,
        "backtestReady": backtest_ready,
        "projectionsReady": projections_ready,
        "parlayReady": parlay_ready,
        "publicLevel": level,
        "counts": {"matches": match_count, "teams": team_count, "groups": group_count,
                   "squadsPublished": squads_published},
        "blockers": blockers,
        "publicMessage": ("Official schedule, groups, and qualified teams are live. "
                          "Projections, odds, and parlays are not available yet — they "
                          "unlock only when real soccer odds + stats providers are "
                          "connected (see docs/research/world-cup-provider-plan-latest.md)."),
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(); ap.add_argument("--out", default=str(OUT)); ap.parse_args(argv)
    payload = derive()
    Path(OUT).write_text(json.dumps(payload, indent=2) + "\n")
    print(f"wrote {OUT} → level={payload['publicLevel']} "
          f"matches={payload['counts']['matches']} teams={payload['counts']['teams']} "
          f"projectionsReady={payload['projectionsReady']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
