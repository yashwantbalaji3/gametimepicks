"""Integrity tests for the static World Cup data artifacts.

We never fabricate schedule / groups / teams, and we never publish
squads until each federation officially releases them. These tests
enforce that contract by validating the artifacts on disk.

Run: python -m pipeline.world_cup_data_test
"""
from __future__ import annotations

import json
import os
import sys
from collections import Counter


GREEN = "\033[0;32m"; RED = "\033[0;31m"; BLUE = "\033[0;34m"; RESET = "\033[0m"

DATA_DIR = os.path.join("app", "public", "data", "world-cup")


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

    def eq(self, a, b, name):
        if a == b:
            self.passed += 1
            print(f"  {GREEN}✓{RESET} {name}")
        else:
            self.failed += 1
            print(f"  {RED}✗{RESET} {name}")
            print(f"    expected {b!r}, got {a!r}")


def _load(name):
    with open(os.path.join(DATA_DIR, name), "r", encoding="utf-8") as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_meta(s: Suite):
    print(f"\n  {BLUE}─── meta.json structure ───{RESET}")
    m = _load("meta.json")
    s.eq(m["tournament"], "FIFA World Cup 2026", "tournament label")
    s.eq(m["format"]["teams"], 48, "48 teams (expanded format)")
    s.eq(m["format"]["groups"], 12, "12 groups")
    s.eq(m["format"]["teamsPerGroup"], 4, "4 teams per group")
    s.eq(m["format"]["groupStageMatches"], 72, "72 group-stage matches")
    s.eq(m["format"]["knockoutMatches"], 32, "32 knockout matches")
    s.eq(m["format"]["totalMatches"], 104, "104 total matches")
    s.ok(
        m["squadStatus"]["officialFinalSquadsReleased"] is False,
        "squads still flagged as not officially released (pending June 2)",
    )
    s.eq(m["squadStatus"]["finalSubmissionDeadline"], "2026-06-01", "submission deadline")
    s.ok(
        m["projectionStatus"]["modelLive"] is False,
        "projection model honestly flagged as not live",
    )
    s.ok(len(m["sources"]) >= 3, "at least three source citations present")


def test_teams(s: Suite):
    print(f"\n  {BLUE}─── teams.json — 48 qualified teams ───{RESET}")
    t = _load("teams.json")
    teams = t["teams"]
    s.eq(len(teams), 48, "exactly 48 teams listed")
    s.eq(t["totalTeams"], 48, "totalTeams field matches array length")

    # Three hosts flagged
    hosts = [x for x in teams if x.get("isHost")]
    s.eq(len(hosts), 3, "three host nations flagged")
    host_codes = sorted(x["code"] for x in hosts)
    s.eq(host_codes, ["CA", "MX", "US"], "hosts are CA, MX, US")

    # Every group A-L has exactly 4 teams
    groups_in_teams = Counter(x["group"] for x in teams)
    expected_groups = set("ABCDEFGHIJKL")
    s.eq(set(groups_in_teams.keys()), expected_groups, "groups A through L present")
    for g, c in groups_in_teams.items():
        s.eq(c, 4, f"group {g} has 4 teams")

    # Every confederation appears at least once
    confs = {x["confederation"] for x in teams}
    s.ok(
        confs == {"AFC", "CAF", "CONCACAF", "CONMEBOL", "OFC", "UEFA"},
        "all six confederations represented",
    )

    # No duplicate team names
    names = [x["name"] for x in teams]
    s.eq(len(names), len(set(names)), "no duplicate team names")

    # Every team carries a non-empty code (used for flag rendering)
    s.ok(all(x.get("code") for x in teams), "every team has a country code")


def test_groups(s: Suite):
    print(f"\n  {BLUE}─── groups.json ↔ teams.json consistency ───{RESET}")
    teams = _load("teams.json")["teams"]
    groups = _load("groups.json")["groups"]
    s.eq(len(groups), 12, "12 groups present")
    team_to_group = {t["name"]: t["group"] for t in teams}
    for g in groups:
        s.eq(len(g["teams"]), 4, f'group {g["id"]} has 4 teams')
        for member in g["teams"]:
            s.eq(
                team_to_group.get(member),
                g["id"],
                f'team {member} → group {g["id"]} (matches teams.json)',
            )


def test_schedule(s: Suite):
    print(f"\n  {BLUE}─── schedule.json — 104 matches ───{RESET}")
    schedule = _load("schedule.json")
    matches = schedule["matches"]
    s.eq(len(matches), 104, "exactly 104 matches")
    s.eq(schedule["totalMatches"], 104, "totalMatches field matches array length")

    # Stage counts
    stages = Counter(m["stage"] for m in matches)
    s.eq(stages["group"], 72, "72 group-stage matches")
    s.eq(stages["r32"], 16, "16 Round-of-32 matches")
    s.eq(stages["r16"], 8, "8 Round-of-16 matches")
    s.eq(stages["qf"], 4, "4 quarter-finals")
    s.eq(stages["sf"], 2, "2 semi-finals")
    s.eq(stages["third"], 1, "1 third-place playoff")
    s.eq(stages["final"], 1, "1 final")

    # Group-stage matches reference real teams and groups
    teams = _load("teams.json")["teams"]
    team_names = {t["name"] for t in teams}
    team_to_group = {t["name"]: t["group"] for t in teams}

    per_group = Counter()
    per_team = Counter()
    for m in matches:
        if m["stage"] != "group":
            continue
        s.ok(m["home"] in team_names, f'match {m["id"]} home "{m["home"]}" is a real team')
        s.ok(m["away"] in team_names, f'match {m["id"]} away "{m["away"]}" is a real team')
        s.eq(team_to_group[m["home"]], m["group"], f'match {m["id"]} home is in group {m["group"]}')
        s.eq(team_to_group[m["away"]], m["group"], f'match {m["id"]} away is in group {m["group"]}')
        per_group[m["group"]] += 1
        per_team[m["home"]] += 1
        per_team[m["away"]] += 1

    # Each group has exactly 6 group-stage matches
    for g in "ABCDEFGHIJKL":
        s.eq(per_group[g], 6, f"group {g} has 6 group-stage matches")

    # Each team plays exactly 3 group-stage matches
    for t in team_names:
        s.eq(per_team[t], 3, f'team "{t}" plays 3 group matches')

    # Knockout matches must NOT reference real team names (placeholders only)
    for m in matches:
        if m["stage"] == "group":
            continue
        s.ok(
            m.get("home") is None and m.get("away") is None,
            f'match {m["id"]} ({m["stage"]}) carries no fabricated team names',
        )
        s.ok(
            m.get("homePlaceholder") and m.get("awayPlaceholder"),
            f'match {m["id"]} ({m["stage"]}) has placeholder labels',
        )

    # Dates: group stage 06-11 .. 06-27, knockout 06-28 .. 07-19
    dates = [m["date"] for m in matches]
    s.eq(min(dates), "2026-06-11", "earliest match is opener 2026-06-11")
    s.eq(max(dates), "2026-07-19", "latest match is final 2026-07-19")

    # Venue countries are restricted to host trio
    venues = {m["venueCountry"] for m in matches}
    s.eq(venues, {"US", "CA", "MX"}, "every venue is in a host country")


def test_squads_are_pending(s: Suite):
    """Hard invariant: no player names appear in the squads artifact
    until official release. This guards against accidental commits of
    predicted rosters."""
    print(f"\n  {BLUE}─── squads.json — pending-release invariant ───{RESET}")
    sq = _load("squads.json")
    s.eq(sq["status"], "pending_official_release", "status is pending")
    s.eq(sq["squads"], [], "squads array is empty (no fabricated rosters)")
    s.eq(sq["officialReleaseDate"], "2026-06-02", "release date documented")
    s.eq(sq["rules"]["playersPerSquad"], 26, "26 players per final squad")


def main():
    s = Suite()
    for t in (
        test_meta,
        test_teams,
        test_groups,
        test_schedule,
        test_squads_are_pending,
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
