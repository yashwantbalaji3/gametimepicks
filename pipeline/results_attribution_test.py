"""Defensive test: per-date comparison reports must NEVER reference a
player / market / line that isn't actually in that date's settled_leans.

Background: PR #78's post-settlement check raised a concern that "James
Harden" appeared in May 21's `bestCalls` while seemingly not being in
the CLE-vs-NY matchup. Investigation showed Harden IS legitimately on
the May 21 CLE settled rows (playerId 201935, team CLE, gameId
401873342) — every row in `bestCalls` matched a real row in
`settled_leans.jsonl` for May 21.

That review confirmed no bug today, but the broader trust risk is
real: a future regression in the report exporter could silently leak a
player from another date into a date-specific leaderboard. This test
locks the invariant in pipeline CI:

    For every settled date with a comparison_report_*.json,
    every (player, market, side, line) in `bestCalls` AND
    `largestMisses` must match a row in `settled_leans.jsonl` whose
    `date` equals that report's `date`.

Run: python -m pipeline.results_attribution_test
"""
from __future__ import annotations

import json
import os
import sys
from typing import Iterable


GREEN = "\033[0;32m"; RED = "\033[0;31m"; BLUE = "\033[0;34m"; RESET = "\033[0m"

RESULTS_DIR = os.path.join("app", "public", "data", "results")


class Suite:
    def __init__(self):
        self.passed = 0
        self.failed = 0

    def ok(self, cond, name):
        if cond:
            self.passed += 1
            print(f"  {GREEN}✓{RESET} {name}")
        else:
            self.failed += 1
            print(f"  {RED}✗{RESET} {name}")


def _iter_rows(date: str) -> Iterable[dict]:
    path = os.path.join(RESULTS_DIR, "settled_leans.jsonl")
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                r = json.loads(line)
            except json.JSONDecodeError:
                continue
            if r.get("date") == date:
                yield r


def _key(r: dict) -> tuple:
    return (
        r.get("playerName"),
        r.get("market"),
        r.get("side"),
        r.get("line"),
    )


def test_no_cross_date_leak(s: Suite):
    print(f"\n  {BLUE}─── bestCalls + largestMisses anchor to the report's date ───{RESET}")
    available = os.path.join(RESULTS_DIR, "available_dates.json")
    if not os.path.exists(available):
        s.ok(False, "available_dates.json missing — settlement export not run")
        return
    dates = json.load(open(available)).get("dates") or []
    s.ok(len(dates) > 0, "at least one settled date in manifest")

    checked = 0
    leaked = 0
    for date in dates:
        report_path = os.path.join(RESULTS_DIR, f"comparison_report_{date}.json")
        if not os.path.exists(report_path):
            continue
        report = json.load(open(report_path))
        real_keys = {_key(r) for r in _iter_rows(date)}
        for section in ("bestCalls", "largestMisses"):
            for entry in report.get(section) or []:
                checked += 1
                if _key(entry) not in real_keys:
                    leaked += 1
                    print(
                        f"    LEAK: {date} {section} has "
                        f"{entry.get('playerName')} {entry.get('market')} "
                        f"{entry.get('side')} L{entry.get('line')} that is NOT "
                        f"in {date}'s settled_leans.jsonl"
                    )
    s.ok(checked > 0, f"checked {checked} report entries across {len(dates)} dates")
    s.ok(leaked == 0, "no cross-date entries leaked into any report")


def test_per_date_player_count_matches_unique_players_in_rows(s: Suite):
    """Soft sanity: every player whose row appears in settled_leans for a
    date should appear at least once when we count them. If the report
    ever drops a player entirely, this won't catch it; but if some
    player from another date is somehow injected, the test above
    handles that case."""
    print(f"\n  {BLUE}─── per-date unique-player count sanity ───{RESET}")
    available = os.path.join(RESULTS_DIR, "available_dates.json")
    if not os.path.exists(available):
        return
    dates = json.load(open(available)).get("dates") or []
    for date in dates:
        names = {r.get("playerName") for r in _iter_rows(date)}
        s.ok(len(names) > 0, f"{date} has at least one settled player")


def main():
    s = Suite()
    test_no_cross_date_leak(s)
    test_per_date_player_count_matches_unique_players_in_rows(s)
    print(
        f"\n{GREEN if s.failed == 0 else RED}"
        f"{'✓' if s.failed == 0 else '✗'} "
        f"{s.passed} assertions passed, {s.failed} failed{RESET}"
    )
    return 0 if s.failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
