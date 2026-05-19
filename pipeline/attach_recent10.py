"""
Phase 9.1 — attach_recent10 CLI (improved reporting).

Walks one (or all) per-day board JSON file(s) and attaches the
`recent10` field to every lean by extracting it from real game logs.

Data source: free nba_api (`fetch_player_game_logs`) — the SAME provider
chain the daily board generator already uses. NO Odds API. NO scraping.
NO fabrication. Real recent game-log values only — if logs are missing,
recent10 stays absent and the UI shows "no recent log data" honestly.

Usage:
  python -m pipeline.attach_recent10 --date 2026-05-05
  python -m pipeline.attach_recent10 --all
  python -m pipeline.attach_recent10 --date 2026-05-05 --dry-run
  python -m pipeline.attach_recent10 --all --verbose

Phase 9.1 additions:
  - Per-player status tracking (matched / zero_id / no_logs / fetch_error)
  - Summary table at end with per-board counts + reason breakdowns
  - Skips playerId == 0 explicitly with a clear unmatched reason
  - --players "1628378,201939" to filter to specific player IDs
  - --strict: exit non-zero if any player is unmatched for a real reason
  - --verbose: per-player detail table

Idempotent — re-running for the same date overwrites existing recent10
values with the freshly-fetched ones. Other lean fields (line, projection,
edge, confidence, bookmaker, etc.) are preserved verbatim.

This script DOES mutate `app/public/data/boards/<date>.json` — it is an
intentional regeneration step you opt into.
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from .confidence_guardrails import (
    MEDIUM_CONF_MIN_LOGS,
    downgrade_lean,
)
from .recent10_extractor import extract_recent10_all_markets

log = logging.getLogger("gtp.attach_recent10")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)


REPO_ROOT = Path(__file__).resolve().parent.parent
BOARDS_DIR = REPO_ROOT / "app" / "public" / "data" / "boards"


@dataclass
class PlayerStatus:
    player_id: int
    player_name: str = ""
    matched: bool = False
    logs_count: int = 0
    pts_attached: int = 0
    reb_attached: int = 0
    ast_attached: int = 0
    reason: str = ""  # ok / zero_id / no_logs / fetch_error / dry_run_skipped


def fetch_logs_for_player(player_id: int) -> tuple[list, Optional[str]]:
    """Return (logs, error_reason). On success, error_reason is None."""
    try:
        from .fetch_nba_data import fetch_player_game_logs
    except ImportError as e:
        return [], f"import_error: {e}"
    try:
        logs, _src = fetch_player_game_logs(player_id, last_n=10)
        return list(logs or []), None
    except Exception as e:
        return [], f"fetch_error: {type(e).__name__}"


def attach_recent10_to_board(
    board_path: Path,
    *,
    dry_run: bool = False,
    only_pids: set[int] | None = None,
) -> dict:
    """
    Read board JSON at `board_path`, attach recent10 to each lean,
    write back unless dry_run. Returns a detailed summary dict.
    """
    if not board_path.exists():
        return {"path": str(board_path), "error": "file not found", "leansUpdated": 0}

    try:
        board = json.loads(board_path.read_text())
    except json.JSONDecodeError as e:
        return {"path": str(board_path), "error": f"malformed JSON: {e}", "leansUpdated": 0}

    leans = board.get("leans") or []
    if not leans:
        return {"path": str(board_path), "boardName": board_path.name, "error": "no leans", "leansUpdated": 0}

    name_by_pid: dict[int, str] = {}
    for l in leans:
        pid = l.get("playerId")
        if isinstance(pid, int):
            if pid not in name_by_pid:
                name_by_pid[pid] = l.get("playerName") or "(unknown)"

    if only_pids is not None:
        unique_pids = sorted(p for p in name_by_pid.keys() if p in only_pids)
    else:
        unique_pids = sorted(name_by_pid.keys())

    log.info(f"  {board_path.name}: {len(leans)} leans, {len(unique_pids)} unique players")
    if not dry_run and unique_pids:
        log.info(f"  fetching game logs via nba_api for {len(unique_pids)} players...")

    by_player_logs: dict[int, dict[str, list[float]]] = {}
    statuses: dict[int, PlayerStatus] = {}

    for pid in unique_pids:
        st = PlayerStatus(player_id=pid, player_name=name_by_pid.get(pid, ""))

        if pid == 0:
            st.reason = "zero_id"
            statuses[pid] = st
            by_player_logs[pid] = {"PTS": [], "REB": [], "AST": []}
            continue

        if dry_run:
            st.reason = "dry_run_skipped"
            statuses[pid] = st
            by_player_logs[pid] = {"PTS": [], "REB": [], "AST": []}
            continue

        logs, err = fetch_logs_for_player(pid)
        if err:
            st.reason = err
            statuses[pid] = st
            by_player_logs[pid] = {"PTS": [], "REB": [], "AST": []}
            continue

        if not logs:
            st.reason = "no_logs"
            statuses[pid] = st
            by_player_logs[pid] = {"PTS": [], "REB": [], "AST": []}
            continue

        st.matched = True
        st.logs_count = len(logs)
        st.reason = "ok"
        market_data = extract_recent10_all_markets(logs, last_n=10)
        by_player_logs[pid] = market_data
        st.pts_attached = len(market_data.get("PTS", []))
        st.reb_attached = len(market_data.get("REB", []))
        st.ast_attached = len(market_data.get("AST", []))
        statuses[pid] = st

    leans_updated = 0
    # PR 21: leans_cleared is preserved at 0 for summary-table back-compat.
    # The destructive `del lean["recent10"]` branch was removed: when a
    # player's fetch fails (no_logs / fetch_error / zero_id / dry_run /
    # import_error), we know nothing new and must preserve any existing
    # recent10 array. Erasing real prior game-log data because of a
    # single transient fetch miss is worse than keeping stale-but-real.
    # The PlayerStatus summary still records the fetch outcome per-pid.
    leans_cleared = 0
    # Phase 21.1 — rescue counter. Whenever generate_daily_board runs in
    # live mode but game-log fetches fail mid-run, R1 stamps every lean
    # `insufficient_data` BEFORE recent10 is attached here. The
    # downgrade_lean idempotency guard then blocks re-evaluation even
    # after recent10 lands. We tracked this by attaching `_guardrail` +
    # `_originalConfidence` on the original stamp, so we can safely
    # restore the model's first-pass confidence when the new log count
    # would have satisfied the threshold in the first place.
    leans_rescued = 0
    for lean in leans:
        pid = lean.get("playerId")
        market = lean.get("market")
        if pid not in by_player_logs or market not in ("PTS", "REB", "AST"):
            continue
        values = by_player_logs[pid].get(market, [])
        if values:
            lean["recent10"] = values
            leans_updated += 1
            # Rescue an R1-suppressed lean when we now have enough log
            # values for at least the Medium threshold. We don't fabricate
            # the lean side — derive it from the model's projection vs
            # the book line, then re-run the full guardrail cascade so
            # R3/R4/R5 caps/anomaly stamps stay honest.
            if (
                lean.get("_guardrail") == "R1_no_logs_insufficient_data"
                and len(values) >= MEDIUM_CONF_MIN_LOGS
            ):
                original_conf = lean.get("_originalConfidence")
                line = lean.get("line")
                projection = lean.get("projection")
                if (
                    original_conf in ("High", "Medium", "Low")
                    and isinstance(line, (int, float))
                    and isinstance(projection, (int, float))
                ):
                    lean["confidence"] = original_conf
                    lean["lean"] = "Over" if projection > line else "Under"
                    lean["pickType"] = "model_lean"
                    lean.pop("_guardrail", None)
                    lean.pop("_guardrailAt", None)
                    lean.pop("_originalConfidence", None)
                    guarded = downgrade_lean(lean)
                    lean.update(guarded)
                    leans_rescued += 1
        # else: preserve existing recent10. See PR 21 note above.

    if not dry_run:
        if "generatedAt" in board:
            board.setdefault("_priorGeneratedAt", board["generatedAt"])
        board["recent10AttachedAt"] = _iso_now()
        board_path.write_text(json.dumps(board, indent=2, sort_keys=True))

    matched_count = sum(1 for s in statuses.values() if s.matched)
    unmatched_by_reason: dict[str, int] = {}
    for s in statuses.values():
        if not s.matched:
            unmatched_by_reason[s.reason] = unmatched_by_reason.get(s.reason, 0) + 1

    return {
        "path": str(board_path),
        "boardName": board_path.name,
        "totalLeans": len(leans),
        "uniquePlayers": len(unique_pids),
        "matchedPlayers": matched_count,
        "leansUpdated": leans_updated,
        "leansCleared": leans_cleared,
        "leansRescued": leans_rescued,
        "unmatchedByReason": unmatched_by_reason,
        "playerStatuses": statuses,
        "dryRun": dry_run,
    }


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _print_summary(summaries: list[dict], *, verbose: bool = False) -> None:
    print()
    print("  " + "─" * 70)
    print(f"  {'board':<22} {'leans':>6} {'players':>8} {'matched':>9} {'updated':>8}")
    print("  " + "─" * 70)
    total_leans = total_players = total_matched = total_updated = total_cleared = 0
    overall_unmatched: dict[str, int] = {}
    for s in summaries:
        if "error" in s:
            print(f"  {s.get('boardName', '?'):<22} ERROR: {s['error']}")
            continue
        print(
            f"  {s['boardName']:<22} "
            f"{s['totalLeans']:>6} "
            f"{s['uniquePlayers']:>8} "
            f"{s['matchedPlayers']:>9} "
            f"{s['leansUpdated']:>8}"
            f"{'  [dry]' if s['dryRun'] else ''}"
        )
        total_leans += s["totalLeans"]
        total_players += s["uniquePlayers"]
        total_matched += s["matchedPlayers"]
        total_updated += s["leansUpdated"]
        total_cleared += s["leansCleared"]
        for reason, n in s["unmatchedByReason"].items():
            overall_unmatched[reason] = overall_unmatched.get(reason, 0) + n
    print("  " + "─" * 70)
    print(
        f"  {'TOTAL':<22} "
        f"{total_leans:>6} "
        f"{total_players:>8} "
        f"{total_matched:>9} "
        f"{total_updated:>8}"
    )
    if total_cleared:
        print(f"  ({total_cleared} stale recent10 arrays cleared)")
    print()

    if overall_unmatched:
        print(f"  Unmatched player reasons:")
        for reason, n in sorted(overall_unmatched.items(), key=lambda x: -x[1]):
            label = {
                "zero_id": "playerId is 0 / missing in board JSON",
                "no_logs": "nba_api returned no game logs",
                "fetch_error": "nba_api request raised an error",
                "dry_run_skipped": "dry-run (no network calls)",
                "import_error": "could not import nba_api provider",
            }.get(reason, reason)
            print(f"    {n:>4}  {label}")
        print()

    if verbose:
        print("  Per-player detail:")
        for s in summaries:
            if "playerStatuses" not in s:
                continue
            for ps in s["playerStatuses"].values():
                if isinstance(ps, PlayerStatus):
                    flag = "✓" if ps.matched else "·"
                    print(
                        f"    {flag} {ps.player_id:>10}  "
                        f"{ps.player_name[:24]:<24}  "
                        f"PTS={ps.pts_attached:>2} REB={ps.reb_attached:>2} AST={ps.ast_attached:>2}  "
                        f"({ps.reason})"
                    )
        print()


def _check_nba_api_available() -> tuple[bool, str]:
    """
    Phase 11 — early loud check that the nba_api package is importable in
    the runtime environment. Writes a clear message to stdout so workflow
    logs surface this immediately instead of failing silently per-player.

    Returns (ok, message).
    """
    try:
        from .fetch_nba_data import fetch_player_game_logs  # noqa: F401
        return True, "nba_api provider chain importable"
    except ImportError as e:
        return False, (
            f"nba_api provider chain import FAILED: {e}\n"
            f"  → install in this environment: pip install -r pipeline/requirements.txt\n"
            f"  → if you see 'nba_api is not a package', remove any local file/dir named "
            f"nba_api that is shadowing the installed package.\n"
            f"  → recent10 attachment will FAIL for every player until this is fixed."
        )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Attach recent10 trend data to board leans (free nba_api)."
    )
    grp = parser.add_mutually_exclusive_group(required=True)
    grp.add_argument("--date", help="single date YYYY-MM-DD")
    grp.add_argument("--all", action="store_true", help="every board file")
    parser.add_argument("--dry-run", action="store_true", help="don't write; just report")
    parser.add_argument("--verbose", action="store_true", help="per-player status table")
    parser.add_argument("--players", help="comma-separated playerIds to filter to")
    parser.add_argument(
        "--strict",
        action="store_true",
        help="exit non-zero if any player is unmatched (excluding zero_id and dry_run_skipped)",
    )
    args = parser.parse_args()

    # Phase 11 — early loud check that nba_api is actually importable.
    # If it fails here, log it clearly so the workflow output makes the
    # cause obvious. Don't abort; the script can still report a 0%-coverage
    # dry-run summary, which is itself useful diagnostic data.
    if not args.dry_run:
        ok, msg = _check_nba_api_available()
        if ok:
            print(f"  ✓ {msg}")
        else:
            print(f"  ✗ {msg}", file=sys.stderr)
            print(
                f"  → continuing anyway; expect 0% coverage in the summary below.",
                file=sys.stderr,
            )

    if args.all:
        targets = sorted(BOARDS_DIR.glob("*.json"))
    else:
        targets = [BOARDS_DIR / f"{args.date}.json"]

    if not targets:
        print("  No board files found.")
        return 1

    only_pids: set[int] | None = None
    if args.players:
        try:
            only_pids = {int(x.strip()) for x in args.players.split(",") if x.strip()}
        except ValueError:
            print("  --players must be comma-separated integers", file=sys.stderr)
            return 2

    summaries: list[dict] = []
    for path in targets:
        s = attach_recent10_to_board(path, dry_run=args.dry_run, only_pids=only_pids)
        summaries.append(s)

    _print_summary(summaries, verbose=args.verbose)

    if args.strict:
        for s in summaries:
            if "unmatchedByReason" not in s:
                continue
            for reason, n in s["unmatchedByReason"].items():
                if reason in ("zero_id", "dry_run_skipped"):
                    continue
                if n > 0:
                    print(
                        f"  --strict: {n} unmatched ({reason}) → exit 3",
                        file=sys.stderr,
                    )
                    return 3

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
