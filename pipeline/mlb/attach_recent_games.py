"""attach_recent_games — FREE, in-place enrichment of an MLB board's leans with
per-game recent-form metadata (`recentGames`: [{date, opponent, isHome, value}]).

WHY: the board's `recentSeries` is a raw value array with no per-game context, so
the leg-detail modal could only show generic G-1..G-5 rows. This backfills the
date / opponent / home-away / per-game value for already-generated boards, using
the MLB Stats API game logs — which are FREE (no Odds API credits). It NEVER
calls the paid odds endpoint and NEVER changes projections, leans, odds, or
grading; it only ADDS a `recentGames` array to each eligible lean.

Leakage guard: only games strictly BEFORE the slate date are kept, so a row can
never be the target game or a future game.

Usage:
  python -m pipeline.mlb.attach_recent_games --date 2026-06-06 [--dry-run] [--verbose]

Idempotent: re-running overwrites `recentGames` with the same result.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from pipeline.mlb import mlb_stats
from pipeline.mlb.mlb_model import recent_games_for_market

REPO = Path(__file__).resolve().parents[2]
BOARDS = REPO / "app" / "public" / "data" / "mlb" / "boards"


def _group_for_market(market_key: str) -> str:
    return "pitching" if market_key == "pitcher_strikeouts" else "hitting"


def enrich_board(date: str, *, dry_run: bool = False, verbose: bool = False) -> dict:
    board_path = BOARDS / f"{date}.json"
    if not board_path.exists():
        raise FileNotFoundError(f"no MLB board for {date}: {board_path}")
    board = json.loads(board_path.read_text())
    leans = board.get("leans", [])
    season = int(date[:4])

    # Collect the (playerId, group) pairs we need logs for.
    need: dict[str, set[int]] = {"pitching": set(), "hitting": set()}
    for ln in leans:
        pid = ln.get("playerId")
        mk = ln.get("marketKey")
        if pid is None or not mk:
            continue
        need[_group_for_market(mk)].add(int(pid))

    logs_by_pid: dict[int, list[dict]] = {}
    for group, pids in need.items():
        if not pids:
            continue
        if verbose:
            print(f"  fetching {len(pids)} {group} game logs (free MLB Stats API)…")
        fetched = mlb_stats.fetch_player_game_logs_bulk(sorted(pids), season, group)
        logs_by_pid.update(fetched)

    enriched = 0
    skipped_no_logs = 0
    total_rows = 0
    for ln in leans:
        pid = ln.get("playerId")
        mk = ln.get("marketKey")
        if pid is None or not mk:
            continue
        logs = logs_by_pid.get(int(pid)) or []
        # Leakage guard: keep only games strictly before the slate date.
        prior = [g for g in logs if (g.get("date") or "") < date]
        games = recent_games_for_market(prior, mk)
        if not logs:
            skipped_no_logs += 1
        ln["recentGames"] = games
        if games:
            enriched += 1
            total_rows += len(games)

    summary = {
        "date": date,
        "leans": len(leans),
        "enriched": enriched,
        "skipped_no_logs": skipped_no_logs,
        "avg_rows": round(total_rows / enriched, 1) if enriched else 0,
    }
    if not dry_run:
        board_path.write_text(json.dumps(board, indent=2))
    return summary


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Attach recentGames metadata to an MLB board (free, in-place).")
    ap.add_argument("--date", required=True, help="slate date YYYY-MM-DD")
    ap.add_argument("--dry-run", action="store_true", help="compute but do not write")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args(argv)
    s = enrich_board(args.date, dry_run=args.dry_run, verbose=args.verbose)
    print(
        f"recentGames {s['date']}: enriched {s['enriched']}/{s['leans']} leans "
        f"(avg {s['avg_rows']} rows; {s['skipped_no_logs']} had no logs)"
        + (" [dry-run]" if args.dry_run else "")
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
