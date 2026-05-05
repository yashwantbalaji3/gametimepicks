"""
Phase 7B-3 — Comprehensive diagnostic report from the latest pipeline run.

Reads app/public/data/board.json + meta.json + slate.json and prints a
human-readable status report. No network calls. Useful for:

    - Verifying what the last pipeline run actually produced
    - Deciding whether the next run will use cache or hit the network
    - Sanity-checking the no-key path before adding ODDS_API_KEY
    - Inspecting which schedule providers responded and how

Usage:
    python -m pipeline.diagnose
    python -m pipeline.diagnose --json   # raw JSON dump for tooling

Exit codes:
    0 — report printed successfully
    1 — board.json or meta.json missing (pipeline never ran)
    2 — unexpected error
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


GREEN = "\033[0;32m"
RED = "\033[0;31m"
YELLOW = "\033[0;33m"
BLUE = "\033[0;34m"
DIM = "\033[2m"
RESET = "\033[0m"


def _ok(msg: str) -> None:
    print(f"  {GREEN}✓{RESET} {msg}")


def _err(msg: str) -> None:
    print(f"  {RED}✗{RESET} {msg}", file=sys.stderr)


def _warn(msg: str) -> None:
    print(f"  {YELLOW}!{RESET} {msg}")


def _info(msg: str) -> None:
    print(f"  {BLUE}·{RESET} {msg}")


def _hr() -> None:
    print(f"{DIM}{'─' * 60}{RESET}")


def _section(title: str) -> None:
    print()
    print(f"  {BLUE}═══ {title} ═══{RESET}")


def _color_data_mode(mode: str) -> str:
    if mode == "Live":
        return f"{GREEN}{mode}{RESET}"
    if mode == "ScheduleLiveOddsUnavailable":
        return f"{GREEN}{mode}{RESET}"
    if mode == "NoGames":
        return f"{DIM}{mode}{RESET}"
    if mode == "ScheduleUnavailable":
        return f"{RED}{mode}{RESET}"
    if mode == "DemoForced":
        return f"{YELLOW}{mode}{RESET}"
    return mode


def _color_status(status: str | None) -> str:
    if status in ("ok", "ok_with_props"):
        return f"{GREEN}{status}{RESET}"
    if status in ("not_configured", "ok_no_props", "dry_run"):
        return f"{YELLOW}{status}{RESET}"
    if status in ("failed", "empty"):
        return f"{RED}{status}{RESET}"
    return str(status)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Print a Phase 7B-3 diagnostic report from the latest pipeline output.",
    )
    parser.add_argument(
        "--json", action="store_true",
        help="Print the raw board.json + meta.json content as JSON (for tooling).",
    )
    parser.add_argument(
        "--data-dir",
        help="Override path to app/public/data/ (defaults to project location).",
    )
    args = parser.parse_args(argv)

    try:
        from . import config as C
    except Exception as e:
        _err(f"Could not import pipeline.config: {e}")
        return 2

    data_dir = Path(args.data_dir) if args.data_dir else C.DATA_OUT
    board_path = data_dir / "board.json"
    meta_path = data_dir / "meta.json"
    slate_path = data_dir / "slate.json"

    if not board_path.exists() or not meta_path.exists():
        _err(f"board.json or meta.json missing in {data_dir}")
        _info("Run the pipeline first: bash scripts/run_pipeline.sh")
        return 1

    try:
        board = json.loads(board_path.read_text())
        meta = json.loads(meta_path.read_text())
        slate = json.loads(slate_path.read_text()) if slate_path.exists() else None
    except Exception as e:
        _err(f"Could not parse pipeline output: {e}")
        return 2

    if args.json:
        out = {"board": board, "meta": meta, "slate": slate}
        print(json.dumps(out, indent=2))
        return 0

    print()
    print(f"{BLUE}╔════════════════════════════════════════════════════════════╗{RESET}")
    print(f"{BLUE}║  GametimePicks — pipeline diagnostic report (Phase 7B-3)   ║{RESET}")
    print(f"{BLUE}╚════════════════════════════════════════════════════════════╝{RESET}")

    # ---- Top-line state ----
    _section("Today's state")
    _info(f"generated for: {board.get('generatedFor')}")
    _info(f"generated at: {board.get('generatedAt')}")
    _info(f"version: {meta.get('version')}")
    _info(f"data mode: {_color_data_mode(board.get('dataMode', '?'))}")

    # ---- Schedule ----
    _section("Schedule resolution")
    _info(f"scheduleSource: {board.get('scheduleSource')}")
    _info(f"scheduleProviderStatus: {_color_status(board.get('scheduleProviderStatus'))}")
    _info(f"scheduleFetchSucceeded: {board.get('scheduleFetchSucceeded')}")
    _info(f"manualOverrideUsed: {board.get('manualOverrideUsed')}")
    if board.get("manualOverrideSource"):
        _info(f"manualOverrideSource: {board['manualOverrideSource']}")
    _info(f"raw game count (before filter): {board.get('rawGameCountBeforeFiltering')}")
    _info(f"parsed game count: {board.get('parsedGameCountAfterFiltering')}")
    if board.get("scheduleFailureReason"):
        _warn(f"failure reason: {board['scheduleFailureReason']}")

    history = board.get("scheduleProviderHistory") or []
    if history:
        print()
        print(f"  {DIM}provider attempt history:{RESET}")
        for h in history:
            err = h.get("error") or ""
            err_s = f" — {err[:60]}" if err else ""
            print(
                f"    {h.get('provider', '?'):18s} "
                f"status={_color_status(h.get('status')):20s} "
                f"games={h.get('games', 0)}{err_s}"
            )

    games = board.get("games") or []
    if games:
        print()
        print(f"  {DIM}games today:{RESET}")
        for g in games:
            print(
                f"    {g.get('awayTeamAbbr', '?')} @ {g.get('homeTeamAbbr', '?')} "
                f"({g.get('tipoff', 'TBD')})"
            )

    # ---- Odds ----
    _section("Odds resolution")
    _info(f"oddsApiKeyConfigured: {meta.get('oddsApiKeyConfigured')}")
    _info(f"oddsSource: {board.get('oddsSource')}")
    _info(f"oddsProviderStatus: {_color_status(board.get('oddsProviderStatus'))}")
    _info(f"oddsFetchAttempted: {board.get('oddsFetchAttempted')}")
    _info(f"oddsFetchSucceeded: {board.get('oddsFetchSucceeded')}")

    rem = board.get("oddsQuotaRemaining")
    used = board.get("oddsQuotaUsed")
    if rem is not None or used is not None:
        print()
        print(f"  {DIM}quota:{RESET}")
        if rem is not None:
            _info(f"credits remaining: {rem}")
        if used is not None:
            _info(f"credits used so far: {used}")
        last = board.get("oddsLastCallCost")
        if last is not None:
            _info(f"last call cost: {last}")

    print()
    print(f"  {DIM}counts:{RESET}")
    _info(f"raw events from /events: {board.get('rawOddsEventCount', 0)}")
    _info(f"events matched to slate: {board.get('matchedOddsEventCount', 0)}")
    _info(f"events fetched (paid /odds): {board.get('attemptedOddsEventCount', 0)}")
    _info(f"props parsed: {board.get('parsedPropCount', 0)}")
    _info(f"cache: {board.get('oddsCacheStatus', '—')}")

    if board.get("oddsFailureReason"):
        print()
        _warn(f"failure reason: {board['oddsFailureReason']}")

    # ---- Configuration ----
    _section("Configuration (from .env / shell)")
    _info(f"markets: {meta.get('oddsMarketsConfigured')}")
    _info(f"regions: {meta.get('oddsRegionsConfigured')!r}")
    _info(f"bookmakers: {meta.get('oddsBookmakersConfigured')}")
    _info(f"max events per run: {meta.get('oddsMaxEventsPerRun')}")
    _info(f"cache TTL (min): {meta.get('oddsCacheTtlMinutes')}")

    # ---- Slate ----
    if slate and slate.get("days"):
        _section(f"Slate ({len(slate['days'])} days)")
        for d in slate["days"]:
            primary = " [PRIMARY]" if d.get("isPrimary") else ""
            print(
                f"    {d.get('date'):12s} {d.get('dayLabel', ''):14s} "
                f"mode={_color_data_mode(d.get('dataMode', '?')):42s} "
                f"src={str(d.get('scheduleSource', '—')):18s} "
                f"g={d.get('gameCount', 0):2d}"
                f"{primary}"
            )

    # ---- Recommendations ----
    _section("Recommendations")
    odds_status = board.get("oddsProviderStatus")
    if odds_status == "not_configured":
        _info("Add ODDS_API_KEY to .env to enable real player props.")
        _info("Run: python -m pipeline.check_odds_key")
    elif odds_status == "dry_run":
        _info("Dry-run mode is on. Set ODDS_DRY_RUN=false to fetch real props.")
    elif odds_status == "failed":
        _warn("Odds fetch failed. Inspect the failure reason above.")
        _info("If this is intermittent, retry. If persistent, run check_odds_key.")
    elif odds_status == "ok_no_props":
        _info("API responded but returned no player props for this slate.")
        _info("Common during early playoff dates. Try again closer to tipoff.")
    elif odds_status == "ok_with_props":
        _ok("Real props are flowing. Pipeline is healthy.")

    sched_status = board.get("scheduleProviderStatus")
    if sched_status == "failed":
        _warn("Schedule unavailable. Add a manual override for this date if known:")
        _info("  pipeline/manual_overrides/schedule_overrides.json")

    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
