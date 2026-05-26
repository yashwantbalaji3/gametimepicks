"""PR #116 — one-shot backfill of `recentGames` onto board JSON leans.

Reads `app/public/data/trends.json` (already on disk, no API needed)
and patches each board lean with the per-game metadata the recent-form
drawer wants:

    recentGames = [
        {"date": "YYYY-MM-DD",
         "opponent": "NYK"|None,
         "isHome": bool|None,
         "value": float},
        ...
    ]

Each board lean carries `playerId` + `market` (PTS / REB / AST). For
each lean we read the matching player's `recentGames` from trends.json,
filter to entries before the board date, project the relevant stat
value, and emit at most 10 rows in chronological order — same shape
the new `recent10_extractor.extract_recent_games` would have produced
on a live fetch.

Honesty rules:
  - Only NBA leans are backfilled (trends.json is NBA-only).
  - When trends has no entries for a market (no `pts` / `reb` / `ast`
    field on a row) the row is dropped. We never fabricate a value.
  - When opponent or home/away is missing we emit `None`, never a
    guess.
  - Future games (date >= board date) are excluded so we never leak
    post-board context.

Usage:
    python -m pipeline.backfill_board_recent_games --date 2026-05-25
    python -m pipeline.backfill_board_recent_games --date 2026-05-26
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
BOARDS_DIR = REPO_ROOT / "app" / "public" / "data" / "boards"
TRENDS_PATH = REPO_ROOT / "app" / "public" / "data" / "trends.json"

_MARKET_TO_TREND_FIELD = {
    "PTS": "pts",
    "REB": "reb",
    "AST": "ast",
}


def _is_real_number(v):
    if isinstance(v, bool):
        return False
    return isinstance(v, (int, float)) and v == v


def _trends_to_recent_games(
    trends_rows: list[dict], market: str, board_date: str
) -> list[dict]:
    """Project a player's trends `recentGames` into the optimizer-leg
    shape for one market, excluding entries on or after `board_date`.
    """
    field = _MARKET_TO_TREND_FIELD.get(market)
    if not field:
        return []
    rows: list[dict] = []
    for r in trends_rows or []:
        date = r.get("date")
        if not isinstance(date, str) or len(date) < 8:
            continue
        # Never include the board date itself or any future row.
        if board_date and date >= board_date:
            continue
        v = r.get(field)
        if not _is_real_number(v):
            continue
        ha = r.get("homeAway")
        if isinstance(ha, str):
            ha_norm = ha.strip().lower()
            if ha_norm == "home":
                is_home = True
            elif ha_norm == "away":
                is_home = False
            else:
                is_home = None
        else:
            is_home = None
        opp = r.get("opponent")
        rows.append({
            "date": date,
            "opponent": opp if isinstance(opp, str) and opp else None,
            "isHome": is_home,
            "value": float(v),
        })
    # Trends file stores newest first; we want OLDEST → NEWEST.
    rows.sort(key=lambda x: x["date"])
    return rows[-10:]


def backfill(date: str, *, dry_run: bool = False) -> dict:
    board_path = BOARDS_DIR / f"{date}.json"
    if not board_path.exists():
        return {"date": date, "error": f"board not found: {board_path}"}
    if not TRENDS_PATH.exists():
        return {"date": date, "error": f"trends not found: {TRENDS_PATH}"}

    board = json.loads(board_path.read_text())
    trends = json.loads(TRENDS_PATH.read_text())
    players_raw = trends.get("players") or []
    # trends.json stores the players list as an array. Index by
    # `playerId` so we can look up matched leans in O(1).
    if isinstance(players_raw, dict):
        players = players_raw
    else:
        players = {}
        for p in players_raw:
            pid = p.get("playerId") if isinstance(p, dict) else None
            if pid is None:
                continue
            players[str(pid)] = p

    leans = board.get("leans") or []
    if not leans:
        return {"date": date, "leans": 0, "patched": 0, "skipped": 0}

    patched = 0
    skipped = 0
    for lean in leans:
        pid = lean.get("playerId")
        market = lean.get("market")
        if not pid or market not in _MARKET_TO_TREND_FIELD:
            skipped += 1
            continue
        # trends.json keys players by stringified playerId.
        player = players.get(str(pid))
        if not player:
            skipped += 1
            continue
        rows = _trends_to_recent_games(
            player.get("recentGames") or [], market, board_date=date
        )
        if rows:
            lean["recentGames"] = rows
            patched += 1
        else:
            skipped += 1

    if not dry_run:
        board_path.write_text(json.dumps(board, indent=2, ensure_ascii=False))

    return {
        "date": date,
        "leans": len(leans),
        "patched": patched,
        "skipped": skipped,
        "dry_run": dry_run,
    }


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Backfill recentGames onto NBA board leans.")
    p.add_argument("--date", required=True, help="YYYY-MM-DD")
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args(argv)
    result = backfill(args.date, dry_run=args.dry_run)
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
