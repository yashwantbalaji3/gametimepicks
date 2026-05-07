"""
Phase 16 — pipeline.settle_template

Generates a pre-filled results_overrides.json template for any date by
reading the board file. The operator just fills in actual stats from
NBA.com box scores; everything else (player names, teams, gameIds,
markets, lines) is auto-populated.

This makes the settlement workflow concrete and low-effort:
  1. Run: python -m pipeline.settle_template --date 2026-05-05
  2. Open: pipeline/overrides/results_overrides.json
  3. Fill in PTS/REB/AST for each player from the box score
  4. Run: python -m pipeline.settle_results --date 2026-05-05 --manual-only
  5. Run: python -m pipeline.export_results

This script never invents data. Stats are left as null so the operator
must manually verify each one. If `--force` is not set and the existing
template's date matches the requested date, the script bails out so we
don't accidentally clobber operator work.

Zero network. Zero Odds API. Pure file-to-file transform.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
BOARDS_DIR = REPO_ROOT / "app" / "public" / "data" / "boards"
OVERRIDES_PATH = REPO_ROOT / "pipeline" / "overrides" / "results_overrides.json"


def load_board(date: str) -> dict:
    """Load the board JSON for a given date. Raises if missing."""
    p = BOARDS_DIR / f"{date}.json"
    if not p.exists():
        raise FileNotFoundError(
            f"No board file at {p}. Run the pipeline for {date} first."
        )
    return json.loads(p.read_text())


def collect_players_per_game(board: dict) -> dict[str, list[dict]]:
    """
    Walk the board's leans and group unique players by gameId.
    Returns: { gameId: [ {playerName, team, opponent, playerId}, ... ] }
    """
    by_game: dict[str, dict[str, dict]] = {}
    for lean in board.get("leans", []):
        gid = lean.get("gameId") or "unknown-game"
        pid = lean.get("playerId") or 0
        name = lean.get("playerName") or "(unknown)"
        # Deduplicate within a game by playerId then name
        key = f"pid:{pid}" if pid else f"name:{name.lower()}"
        if gid not in by_game:
            by_game[gid] = {}
        if key not in by_game[gid]:
            by_game[gid][key] = {
                "playerName": name,
                "team": lean.get("team") or "",
                "opponent": lean.get("opponent") or "",
                "playerId": pid or None,
            }
    # Convert inner dicts to lists, sort by player name for readable JSON
    out = {}
    for gid, players in by_game.items():
        out[gid] = sorted(players.values(), key=lambda p: p["playerName"])
    return out


def build_template(date: str, board: dict) -> dict:
    """Build the operator-facing template structure."""
    players_per_game = collect_players_per_game(board)

    games_section = []
    for gid, players in sorted(players_per_game.items()):
        # Try to derive a readable matchup label
        away_home = ""
        if players:
            t1 = players[0].get("team")
            t2 = players[0].get("opponent")
            if t1 and t2:
                away_home = f"{t1}@{t2}"
        games_section.append(
            {
                "gameId": away_home or gid,
                "_internalGameId": gid,
                "source": "manual verified — fill in from NBA.com box score",
                "players": [
                    {
                        "playerName": p["playerName"],
                        "team": p["team"],
                        "playerId": p["playerId"],
                        "PTS": None,
                        "REB": None,
                        "AST": None,
                    }
                    for p in players
                ],
            }
        )

    return {
        "_comment": "Manual final-stat overrides for settlement. Phase 16 template.",
        "_instructions": [
            f"1. This template was auto-generated for {date}.",
            "2. For each player, fill in PTS / REB / AST as integers from the final box score.",
            "3. Use null for stats you can't verify; settlement will skip those markets.",
            "4. Source for stats: NBA.com box scores or basketball-reference.com.",
            "5. Save the file, then run the settlement step (see docs/SETTLEMENT_GUIDE.md).",
        ],
        "date": date,
        "games": games_section,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Generate a settlement template")
    ap.add_argument("--date", required=True, help="YYYY-MM-DD slate date")
    ap.add_argument(
        "--out",
        default=str(OVERRIDES_PATH),
        help=f"Output path (default: {OVERRIDES_PATH})",
    )
    ap.add_argument(
        "--force",
        action="store_true",
        help="Overwrite existing template even if its date matches",
    )
    ap.add_argument(
        "--stdout",
        action="store_true",
        help="Print the template JSON to stdout instead of writing a file",
    )
    args = ap.parse_args()

    try:
        board = load_board(args.date)
    except FileNotFoundError as e:
        print(f"  ✗ {e}")
        return 1

    template = build_template(args.date, board)
    n_games = len(template["games"])
    n_players = sum(len(g["players"]) for g in template["games"])

    if args.stdout:
        print(json.dumps(template, indent=2))
        return 0

    out_path = Path(args.out)
    if out_path.exists() and not args.force:
        existing = json.loads(out_path.read_text())
        if existing.get("date") == args.date:
            print(
                f"  ! {out_path} already targets {args.date}. "
                f"Use --force to overwrite."
            )
            return 1

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(template, indent=2) + "\n")
    print(f"  ✓ wrote template for {args.date}")
    print(f"    {n_games} game(s), {n_players} player(s)")
    print(f"    {out_path}")
    print()
    print("  Next steps:")
    print(f"    1. Open {out_path}")
    print("    2. Fill in PTS/REB/AST for each player from NBA.com")
    print(f"    3. Run: python -m pipeline.settle_results --date {args.date} --manual-only")
    print("    4. Run: python -m pipeline.export_results")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
