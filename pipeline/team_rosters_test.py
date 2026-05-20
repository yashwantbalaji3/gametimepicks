"""Tests for pipeline.team_rosters.

Pure unit tests. Every assertion verifies a real consumer of the
lookup (`team_projection.py` uses these to rescue empty-team leans).

Run: python -m pipeline.team_rosters_test
"""
from __future__ import annotations

import sys

from . import team_rosters as TR


GREEN = "\033[0;32m"; RED = "\033[0;31m"; BLUE = "\033[0;34m"; RESET = "\033[0m"


class Suite:
    def __init__(self):
        self.passed = 0; self.failed = 0; self.failures = []

    def assert_eq(self, actual, expected, name):
        if actual == expected:
            self.passed += 1; print(f"  {GREEN}✓{RESET} {name}")
        else:
            self.failed += 1
            self.failures.append(f"{name}: expected {expected!r}, got {actual!r}")
            print(f"  {RED}✗{RESET} {name}")
            print(f"    expected: {expected!r}"); print(f"    got:      {actual!r}")

    def assert_true(self, cond, name):
        if cond:
            self.passed += 1; print(f"  {GREEN}✓{RESET} {name}")
        else:
            self.failed += 1; print(f"  {RED}✗{RESET} {name}")


def test_sa_players_map_to_sa(s: Suite):
    print(f"\n  {BLUE}─── SA-side May 19/20 players map to SA ───{RESET}")
    for name in (
        "Victor Wembanyama",
        "Stephon Castle",
        "Devin Vassell",
        "Julian Champagnie",
        "De'Aaron Fox",
        "Dylan Harper",
        "Keldon Johnson",
    ):
        s.assert_eq(TR.team_for_player(name), "SA", f"{name} → SA")


def test_okc_players_map_to_okc(s: Suite):
    print(f"\n  {BLUE}─── OKC-side May 20 players map to OKC ───{RESET}")
    for name in (
        "Shai Gilgeous-Alexander",
        "Chet Holmgren",
        "Jalen Williams",
        "Isaiah Hartenstein",
        "Alex Caruso",
        "Luguentz Dort",
    ):
        s.assert_eq(TR.team_for_player(name), "OKC", f"{name} → OKC")


def test_ny_and_cle_players(s: Suite):
    print(f"\n  {BLUE}─── ECF rosters: NY + CLE ───{RESET}")
    for name in ("Jalen Brunson", "Mikal Bridges", "Karl-Anthony Towns",
                 "Josh Hart", "Mitchell Robinson", "Miles McBride"):
        s.assert_eq(TR.team_for_player(name), "NY", f"{name} → NY")
    for name in ("Donovan Mitchell", "Evan Mobley", "Jarrett Allen",
                 "Max Strus", "Sam Merrill", "Dean Wade"):
        s.assert_eq(TR.team_for_player(name), "CLE", f"{name} → CLE")


def test_unknown_player_returns_none(s: Suite):
    print(f"\n  {BLUE}─── unknown player → None (no misattribution) ───{RESET}")
    s.assert_eq(TR.team_for_player("Nikola Jokic"), None, "Jokic not in map → None")
    s.assert_eq(TR.team_for_player("nobody"), None, "nobody → None")
    s.assert_eq(TR.team_for_player(""), None, "empty string → None")


def test_non_string_returns_none(s: Suite):
    print(f"\n  {BLUE}─── non-string input → None ───{RESET}")
    s.assert_eq(TR.team_for_player(None), None, "None → None")  # type: ignore[arg-type]
    s.assert_eq(TR.team_for_player(123), None, "int → None")  # type: ignore[arg-type]


def test_whitespace_normalisation(s: Suite):
    print(f"\n  {BLUE}─── leading/trailing whitespace tolerated ───{RESET}")
    s.assert_eq(TR.team_for_player("  Victor Wembanyama  "), "SA",
                "trimmed name still resolves")


def test_known_teams_and_sizes(s: Suite):
    print(f"\n  {BLUE}─── known_teams + roster_size sanity ───{RESET}")
    teams = TR.known_teams()
    s.assert_eq(set(teams), {"SA", "OKC", "CLE", "NY"},
                "the 4 playoff teams are mapped")
    for team in teams:
        s.assert_true(TR.roster_size(team) >= 10,
                      f"{team} has at least 10 players")
    s.assert_eq(TR.roster_size("LAL"), 0, "unmapped team → 0")


def test_no_player_appears_in_two_teams(s: Suite):
    """Defensive — guarantees the reverse map is unambiguous."""
    print(f"\n  {BLUE}─── no player appears in two rosters ───{RESET}")
    seen: dict[str, str] = {}
    duplicates: list[tuple[str, str, str]] = []
    for team, names in TR.NBA_PLAYOFF_ROSTERS.items():
        for name in names:
            if name in seen and seen[name] != team:
                duplicates.append((name, seen[name], team))
            seen[name] = team
    s.assert_eq(duplicates, [], "no duplicate player → team mapping")


def main():
    s = Suite()
    for t in (
        test_sa_players_map_to_sa,
        test_okc_players_map_to_okc,
        test_ny_and_cle_players,
        test_unknown_player_returns_none,
        test_non_string_returns_none,
        test_whitespace_normalisation,
        test_known_teams_and_sizes,
        test_no_player_appears_in_two_teams,
    ):
        t(s)
    print(
        f"\n{GREEN if s.failed == 0 else RED}"
        f"{'✓' if s.failed == 0 else '✗'} "
        f"{s.passed} assertions passed, {s.failed} failed{RESET}"
    )
    return 0 if s.failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
