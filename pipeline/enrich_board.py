"""
PR 11 — Incremental projection enrichment for trends_pending leans.

Reads an existing board JSON and fills in projection / edge / confidence /
recent10 for leans where:
  - playerId > 0
  - confidence == "trends_pending"
  - projection is None

Fetches game logs via the free nba_api provider chain. Processes up to
--limit unique players per run so a slow stats.nba.com response never
blows past the workflow timeout. Multiple runs converge the board to
full coverage as the cache warms.

This script:
  - NEVER calls The Odds API.
  - NEVER touches props, schedule, or game-level fields.
  - NEVER fabricates projections — if logs are missing, the lean stays
    trends_pending and the next run retries.
  - NEVER downgrades a lean that has already been scored.

Usage:
  python -m pipeline.enrich_board --date 2026-05-12
  python -m pipeline.enrich_board --all --limit 30
  python -m pipeline.enrich_board --date 2026-05-12 --dry-run
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

# Heavy imports at module level so unittest.mock.patch can target them
# from outside. If any are unavailable in the environment, fail loudly.
from .fetch_nba_data import fetch_player_game_logs
from .build_features import build_player_features
from .score_model import score_prop
from .recent10_extractor import extract_recent10_all_markets

log = logging.getLogger("gtp.enrich_board")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)

REPO_ROOT = Path(__file__).resolve().parent.parent
BOARDS_DIR = REPO_ROOT / "app" / "public" / "data" / "boards"


def _is_enrichment_candidate(lean: dict) -> bool:
    """A lean needs enrichment if it has a resolved playerId, is in
    trends_pending state, and has no projection yet."""
    pid = lean.get("playerId") or 0
    return (
        pid > 0
        and lean.get("confidence") == "trends_pending"
        and lean.get("projection") is None
    )


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def enrich_board(
    board_path: Path,
    *,
    limit: int = 30,
    dry_run: bool = False,
) -> dict:
    """Read board JSON, enrich up to `limit` unique candidate players,
    write back atomically. Returns a summary dict."""

    if not board_path.exists():
        return {"path": str(board_path), "error": "file not found", "enriched": 0}

    try:
        board = json.loads(board_path.read_text())
    except json.JSONDecodeError as e:
        return {"path": str(board_path), "error": f"malformed JSON: {e}", "enriched": 0}

    leans = board.get("leans") or []
    if not leans:
        return {
            "path": str(board_path), "boardName": board_path.name,
            "totalLeans": 0, "candidates": 0, "enriched": 0,
            "playersFetched": 0, "dryRun": dry_run,
        }

    candidates = [l for l in leans if _is_enrichment_candidate(l)]

    # Unique playerIds preserving first-appearance order
    seen_pids: list[int] = []
    for c in candidates:
        pid = int(c["playerId"])
        if pid not in seen_pids:
            seen_pids.append(pid)
        if len(seen_pids) >= limit:
            break

    summary = {
        "path": str(board_path),
        "boardName": board_path.name,
        "totalLeans": len(leans),
        "candidates": len(candidates),
        "playersToFetch": len(seen_pids),
        "playersFetched": 0,
        "enriched": 0,
        "fetchErrors": 0,
        "dryRun": dry_run,
    }

    if not candidates:
        log.info(f"  {board_path.name}: 0 leans need enrichment")
        return summary

    log.info(
        f"  {board_path.name}: {len(candidates)} candidate leans, "
        f"processing {len(seen_pids)} unique players (limit={limit})"
    )

    if dry_run:
        return summary

    # Fetch game logs for each unique candidate player. Last_n=12 matches
    # generate_daily_board's GAME_LOG_WINDOW so the cache hits are consistent.
    features_by_pid: dict[int, dict] = {}
    recent10_by_pid: dict[int, dict[str, list[float]]] = {}
    fetched = 0
    errors = 0

    for pid in seen_pids:
        try:
            logs, _src = fetch_player_game_logs(pid, last_n=12)
            if not logs:
                errors += 1
                continue
            features_by_pid[pid] = build_player_features(logs)
            recent10_by_pid[pid] = extract_recent10_all_markets(logs, last_n=10)
            fetched += 1
        except Exception as e:
            log.info(f"  fetch failed for pid={pid}: {type(e).__name__}")
            errors += 1
            continue

    summary["playersFetched"] = fetched
    summary["fetchErrors"] = errors

    # Update affected leans in place. Re-check the candidate predicate so
    # we don't accidentally touch anything that doesn't qualify.
    enriched = 0
    for lean in leans:
        if not _is_enrichment_candidate(lean):
            continue
        pid = int(lean["playerId"])
        if pid not in features_by_pid:
            continue
        feats = features_by_pid[pid]
        market = lean.get("market")
        if market not in ("PTS", "REB", "AST"):
            continue
        try:
            scored = score_prop(
                features=feats,
                market=market,
                line=float(lean.get("line") or 0),
                odds_over=int(lean.get("oddsOver") or 0),
                odds_under=int(lean.get("oddsUnder") or 0),
                home_away=lean.get("homeAway") or "Home",
                player_name=lean.get("playerName") or "",
            )
        except Exception as e:
            log.warning(f"  score_prop failed for {lean.get('id')}: {e}")
            continue

        lean["projection"] = scored.projection
        lean["modelProjection"] = scored.projection
        lean["modelProbability"] = scored.model_probability
        lean["edgePct"] = scored.edge_pct
        lean["edge"] = scored.edge_pct
        lean["confidence"] = scored.confidence
        lean["lean"] = scored.lean
        lean["reason"] = scored.reason
        if scored.confidence in ("no_play", "insufficient_data"):
            lean["pickType"] = "no_play"
        else:
            lean["pickType"] = "model_lean"
        # Attach recent10 for this market when available
        r10 = recent10_by_pid.get(pid, {}).get(market, [])
        if r10:
            lean["recent10"] = r10
        enriched += 1

    summary["enriched"] = enriched

    if enriched > 0 or fetched > 0:
        board["_lastEnrichedAt"] = _iso_now()
        # Atomic write (write to .tmp, then rename) so a kill mid-write
        # never leaves a corrupt board on disk.
        tmp = board_path.with_suffix(board_path.suffix + ".tmp")
        tmp.write_text(json.dumps(board, indent=2, sort_keys=True))
        tmp.replace(board_path)
        log.info(
            f"  {board_path.name}: enriched {enriched} leans "
            f"from {fetched}/{len(seen_pids)} fetched players"
        )

    return summary


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Incrementally attach projections to trends_pending leans (free nba_api)."
    )
    grp = parser.add_mutually_exclusive_group(required=True)
    grp.add_argument("--date", help="single date YYYY-MM-DD")
    grp.add_argument("--all", action="store_true", help="every board file")
    parser.add_argument(
        "--limit", type=int, default=30,
        help="max unique players per run (default 30)",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="report what would happen without fetching or writing",
    )
    args = parser.parse_args()

    targets = (
        sorted(BOARDS_DIR.glob("*.json"))
        if args.all
        else [BOARDS_DIR / f"{args.date}.json"]
    )
    if not targets:
        print("  No board files found.")
        return 1

    summaries = []
    for path in targets:
        s = enrich_board(path, limit=args.limit, dry_run=args.dry_run)
        summaries.append(s)

    # Summary table
    print()
    print("  " + "─" * 78)
    print(f"  {'board':<22} {'leans':>6} {'cand':>5} {'fetch':>6} {'enr':>5}")
    print("  " + "─" * 78)
    total_enr = 0
    for s in summaries:
        if "error" in s:
            print(f"  {s.get('boardName', '?'):<22} ERROR: {s['error']}")
            continue
        total_enr += s["enriched"]
        print(
            f"  {s['boardName']:<22} "
            f"{s['totalLeans']:>6} "
            f"{s['candidates']:>5} "
            f"{s['playersFetched']:>6} "
            f"{s['enriched']:>5}"
            f"{'  [dry]' if s.get('dryRun') else ''}"
        )
    print("  " + "─" * 78)
    print(f"  total leans enriched this run: {total_enr}")
    print()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
