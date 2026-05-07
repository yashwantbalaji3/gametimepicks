"""
Phase 11 — pipeline.inspect_trends

Read-only diagnostic that answers the operator question:
"Why aren't my mini trend graphs showing on production?"

Walks every board JSON in app/public/data/boards/ and reports:
  - per-board recent10 coverage (X of Y leans have recent10 >= 2 values)
  - per-player breakdown (which players got data, which didn't, why)
  - data-flow sanity checks (playerId integrity, recent10 array shape)
  - last attach_recent10 run timestamp per board
  - global coverage % so you know at a glance if the workflow is working

Zero network. Zero Odds API. Zero mutation. Safe to run anytime.

Usage:
  python -m pipeline.inspect_trends
  python -m pipeline.inspect_trends --json     # machine-readable output
  python -m pipeline.inspect_trends --date 2026-05-05
  python -m pipeline.inspect_trends --players  # show the player ID list

Exit codes:
  0  diagnostic ran successfully (regardless of coverage)
  1  no board files found
  2  --strict and coverage below threshold
"""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Optional

REPO_ROOT = Path(__file__).resolve().parent.parent
BOARDS_DIR = REPO_ROOT / "app" / "public" / "data" / "boards"


@dataclass
class BoardCoverage:
    name: str
    total_leans: int
    leans_with_recent10: int
    unique_player_ids: int
    valid_player_ids: int
    zero_id_players: int
    recent10_attached_at: Optional[str]
    players_with_data: list[tuple[int, str]]  # (player_id, name)
    players_without_data: list[tuple[int, str, str]]  # (player_id, name, reason)


def inspect_board(path: Path) -> Optional[BoardCoverage]:
    """Inspect a single board JSON file. Returns None if file is malformed."""
    try:
        data = json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return None

    leans = data.get("leans") or []
    if not leans:
        return BoardCoverage(
            name=path.name,
            total_leans=0,
            leans_with_recent10=0,
            unique_player_ids=0,
            valid_player_ids=0,
            zero_id_players=0,
            recent10_attached_at=data.get("recent10AttachedAt"),
            players_with_data=[],
            players_without_data=[],
        )

    leans_with_r10 = sum(
        1
        for l in leans
        if isinstance(l.get("recent10"), list) and len(l.get("recent10", [])) >= 2
    )

    # Per-player aggregation
    player_data: dict[int, dict] = {}
    for l in leans:
        pid = l.get("playerId")
        if not isinstance(pid, int):
            continue
        slot = player_data.setdefault(
            pid,
            {
                "name": l.get("playerName") or "(unknown)",
                "markets_with_data": [],
                "markets_without_data": [],
            },
        )
        market = l.get("market")
        if market not in ("PTS", "REB", "AST"):
            continue
        if isinstance(l.get("recent10"), list) and len(l.get("recent10", [])) >= 2:
            slot["markets_with_data"].append(market)
        else:
            slot["markets_without_data"].append(market)

    players_with_data: list[tuple[int, str]] = []
    players_without_data: list[tuple[int, str, str]] = []
    valid_pids = 0
    zero_id_count = 0

    for pid, info in sorted(player_data.items()):
        if pid == 0:
            zero_id_count += 1
            players_without_data.append((pid, info["name"], "zero_id"))
            continue
        valid_pids += 1
        if info["markets_with_data"]:
            players_with_data.append((pid, info["name"]))
        else:
            players_without_data.append((pid, info["name"], "no_logs"))

    return BoardCoverage(
        name=path.name,
        total_leans=len(leans),
        leans_with_recent10=leans_with_r10,
        unique_player_ids=len(player_data),
        valid_player_ids=valid_pids,
        zero_id_players=zero_id_count,
        recent10_attached_at=data.get("recent10AttachedAt"),
        players_with_data=players_with_data,
        players_without_data=players_without_data,
    )


def _print_human(boards: list[BoardCoverage], *, show_players: bool) -> None:
    """Pretty-printed output for terminals."""
    print()
    print("  " + "─" * 80)
    print(
        f"  {'board':<24} {'leans':>6} {'with':>5} {'cov':>5}  "
        f"{'pids':>5} {'zero':>5} {'attached_at':<24}"
    )
    print("  " + "─" * 80)
    total_leans = total_with = total_pids = total_zero = 0
    for b in boards:
        if b.total_leans == 0:
            print(f"  {b.name:<24} (no leans)")
            continue
        cov = 100 * b.leans_with_recent10 // b.total_leans if b.total_leans else 0
        attached = b.recent10_attached_at or "NEVER"
        if attached != "NEVER":
            attached = attached[:19]  # trim micros / tz
        print(
            f"  {b.name:<24} "
            f"{b.total_leans:>6} "
            f"{b.leans_with_recent10:>5} "
            f"{cov:>4}% "
            f" {b.unique_player_ids:>5} "
            f"{b.zero_id_players:>5} "
            f"{attached:<24}"
        )
        total_leans += b.total_leans
        total_with += b.leans_with_recent10
        total_pids += b.unique_player_ids
        total_zero += b.zero_id_players

    print("  " + "─" * 80)
    overall_cov = 100 * total_with // total_leans if total_leans else 0
    print(
        f"  {'TOTAL':<24} "
        f"{total_leans:>6} "
        f"{total_with:>5} "
        f"{overall_cov:>4}%  "
        f"{total_pids:>5} "
        f"{total_zero:>5}"
    )
    print()
    print(f"  Overall coverage: {total_with}/{total_leans} leans = {overall_cov}%")
    print()

    # Diagnose: if coverage is low, explain why
    if overall_cov == 0:
        print(f"  ⚠  Zero coverage. Possible causes:")
        print(f"     1. attach_recent10 has never run, OR")
        print(f"     2. nba_api could not import in the run environment, OR")
        print(f"     3. all players have playerId=0 in board JSON ({total_zero} found), OR")
        print(f"     4. the workflow ran but couldn't push (Settings → Actions → workflow permissions)")
        print()
    elif overall_cov < 30:
        print(f"  ⚠  Low coverage ({overall_cov}%). Likely cause:")
        if total_zero > 0:
            print(f"     {total_zero} player(s) have playerId=0 in board JSON — these can't be matched.")
            print(f"     Fix: regenerate the board with the nba_api schedule provider so playerIds are real.")
        else:
            print(f"     nba_api may be returning empty logs for many players.")
            print(f"     Try: python -m pipeline.attach_recent10 --all --verbose")
        print()
    else:
        print(f"  ✓  Coverage looks healthy.")
        print()

    if show_players:
        print("  Players WITH recent10 data:")
        for b in boards:
            if not b.players_with_data:
                continue
            print(f"    {b.name}:")
            for pid, name in b.players_with_data:
                print(f"      ✓ {pid:>10}  {name}")
        print()
        print("  Players WITHOUT recent10 data:")
        for b in boards:
            if not b.players_without_data:
                continue
            print(f"    {b.name}:")
            for pid, name, reason in b.players_without_data:
                print(f"      · {pid:>10}  {name}  ({reason})")
        print()


def _print_json(boards: list[BoardCoverage]) -> None:
    """Machine-readable output."""
    out = {
        "boards": [asdict(b) for b in boards],
    }
    total_leans = sum(b.total_leans for b in boards)
    total_with = sum(b.leans_with_recent10 for b in boards)
    out["totals"] = {
        "totalLeans": total_leans,
        "leansWithRecent10": total_with,
        "coveragePct": (100 * total_with // total_leans) if total_leans else 0,
    }
    print(json.dumps(out, indent=2, sort_keys=True))


def main() -> int:
    parser = argparse.ArgumentParser(description="Inspect recent10 coverage across boards.")
    parser.add_argument("--date", help="single date YYYY-MM-DD (default: all)")
    parser.add_argument("--json", action="store_true", help="machine-readable JSON output")
    parser.add_argument("--players", action="store_true", help="show per-player breakdown")
    parser.add_argument(
        "--strict",
        type=int,
        metavar="MIN_PCT",
        help="exit non-zero if overall coverage < MIN_PCT (e.g. --strict 30)",
    )
    args = parser.parse_args()

    if args.date:
        targets = [BOARDS_DIR / f"{args.date}.json"]
    else:
        targets = sorted(BOARDS_DIR.glob("*.json"))

    if not targets:
        print("  No board files found in app/public/data/boards/", file=sys.stderr)
        return 1

    coverage: list[BoardCoverage] = []
    for path in targets:
        c = inspect_board(path)
        if c is not None:
            coverage.append(c)

    if args.json:
        _print_json(coverage)
    else:
        _print_human(coverage, show_players=args.players)

    if args.strict is not None:
        total_leans = sum(b.total_leans for b in coverage)
        total_with = sum(b.leans_with_recent10 for b in coverage)
        cov = (100 * total_with // total_leans) if total_leans else 0
        if cov < args.strict:
            print(
                f"  --strict: coverage {cov}% < {args.strict}% threshold → exit 2",
                file=sys.stderr,
            )
            return 2

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
