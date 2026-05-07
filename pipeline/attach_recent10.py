"""
Phase 8.1 — attach_recent10 CLI.

Walks one (or all) per-day board JSON file(s) and attaches the
`recent10` field to every lean by extracting it from real game logs.

Data source: free nba_api (`fetch_player_game_logs`) — the SAME provider
chain the daily board generator already uses. NO Odds API. NO scraping.

Usage:
  python -m pipeline.attach_recent10 --date 2026-05-05
  python -m pipeline.attach_recent10 --all
  python -m pipeline.attach_recent10 --date 2026-05-05 --dry-run

Idempotent — re-running for the same date overwrites existing recent10
values with the freshly-fetched ones.

Failure modes (graceful):
  - nba_api fails for a player → that lean's recent10 is removed, not
    set to a fake. Frontend shows "no trend" placeholder.
  - Log entry missing a stat → that entry is dropped (recent10 is the
    list of valid entries only, never zero-filled).
  - No logs at all for a player → `recent10` is removed entirely.

This script DOES mutate `app/public/data/boards/<date>.json` — it is an
intentional regeneration step the user opts into. Other board fields
are preserved verbatim.
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

from .recent10_extractor import extract_recent10_all_markets

log = logging.getLogger("gtp.attach_recent10")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)


REPO_ROOT = Path(__file__).resolve().parent.parent
BOARDS_DIR = REPO_ROOT / "app" / "public" / "data" / "boards"


def fetch_logs_for_player(player_id: int) -> list:
    """Try the project's free nba_api provider chain. Return logs or []."""
    try:
        from .fetch_nba_data import fetch_player_game_logs
    except ImportError as e:
        log.warning(f"could not import fetch_player_game_logs: {e}")
        return []
    try:
        logs, _src = fetch_player_game_logs(player_id, last_n=10)
        return list(logs or [])
    except Exception as e:
        log.warning(f"fetch_player_game_logs failed for player {player_id}: {e}")
        return []


def attach_recent10_to_board(board_path: Path, *, dry_run: bool = False) -> dict:
    """
    Read board JSON at `board_path`, attach recent10 to each lean,
    write back unless dry_run. Returns a summary dict.
    """
    if not board_path.exists():
        return {"path": str(board_path), "error": "file not found", "leansUpdated": 0}

    try:
        board = json.loads(board_path.read_text())
    except json.JSONDecodeError as e:
        return {"path": str(board_path), "error": f"malformed JSON: {e}", "leansUpdated": 0}

    leans = board.get("leans") or []
    if not leans:
        return {"path": str(board_path), "error": "no leans", "leansUpdated": 0}

    # Cache logs per player so we only hit nba_api once per (player_id)
    by_player: dict[int, dict[str, list[float]]] = {}
    unique_pids = sorted({l.get("playerId") for l in leans if isinstance(l.get("playerId"), int)})

    log.info(f"  {board_path.name}: {len(leans)} leans, {len(unique_pids)} unique players")
    if not dry_run:
        log.info(f"  fetching game logs via nba_api for {len(unique_pids)} players...")

    if dry_run:
        # Skip network in dry-run; just report what would happen.
        for pid in unique_pids:
            by_player[pid] = {"PTS": [], "REB": [], "AST": []}
    else:
        for pid in unique_pids:
            logs = fetch_logs_for_player(pid)
            by_player[pid] = extract_recent10_all_markets(logs, last_n=10)

    # Attach to each lean
    leans_updated = 0
    leans_cleared = 0
    for lean in leans:
        pid = lean.get("playerId")
        market = lean.get("market")
        if pid not in by_player or market not in ("PTS", "REB", "AST"):
            continue
        values = by_player[pid].get(market, [])
        if values:
            lean["recent10"] = values
            leans_updated += 1
        else:
            # Clear stale value if any so we don't leave fake-looking data.
            if "recent10" in lean:
                del lean["recent10"]
                leans_cleared += 1

    # Bump generatedAt to mark mutation. Keep original for audit.
    if not dry_run:
        if "generatedAt" in board:
            board.setdefault("_priorGeneratedAt", board["generatedAt"])
        board["recent10AttachedAt"] = _iso_now()
        board_path.write_text(json.dumps(board, indent=2, sort_keys=True))

    return {
        "path": str(board_path),
        "leansUpdated": leans_updated,
        "leansCleared": leans_cleared,
        "uniquePlayers": len(unique_pids),
        "dryRun": dry_run,
    }


def _iso_now() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def main() -> int:
    parser = argparse.ArgumentParser(description="Attach recent10 trend data to board leans.")
    grp = parser.add_mutually_exclusive_group(required=True)
    grp.add_argument("--date", help="single date YYYY-MM-DD")
    grp.add_argument("--all", action="store_true", help="every board file in app/public/data/boards/")
    parser.add_argument("--dry-run", action="store_true", help="don't write; just report counts")
    args = parser.parse_args()

    if args.all:
        targets = sorted(BOARDS_DIR.glob("*.json"))
    else:
        targets = [BOARDS_DIR / f"{args.date}.json"]

    if not targets:
        print("  No board files found.")
        return 1

    overall = {"boards": 0, "leansUpdated": 0, "leansCleared": 0}
    for path in targets:
        summary = attach_recent10_to_board(path, dry_run=args.dry_run)
        overall["boards"] += 1
        overall["leansUpdated"] += summary.get("leansUpdated", 0)
        overall["leansCleared"] += summary.get("leansCleared", 0)
        if "error" in summary:
            print(f"  ✗ {path.name}: {summary['error']}")
        else:
            tag = " [dry-run]" if summary.get("dryRun") else ""
            print(f"  ✓ {path.name}: {summary['leansUpdated']} leans updated, "
                  f"{summary['leansCleared']} cleared, "
                  f"{summary['uniquePlayers']} players{tag}")

    print()
    print(f"  Total: {overall['boards']} boards, "
          f"{overall['leansUpdated']} leans updated, "
          f"{overall['leansCleared']} cleared")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
