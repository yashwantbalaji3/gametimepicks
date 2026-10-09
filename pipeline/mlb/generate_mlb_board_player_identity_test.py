"""TRUTH-001 — player identity tests for pipeline.mlb.generate_mlb_board.

No network calls. Every case feeds roster entries + market rows through the pure helpers
(`resolve_player_identity`, `build_identity_pool`, `resolve_row_identities`).

THE DEFECTS
1. Accents. The board looked the provider's name up EXACTLY in a roster dict keyed by StatsAPI
   `fullName`. The provider writes "Jose Ramirez"; StatsAPI writes "José Ramírez". Since 2026-09-01,
   1,286 batter rows and 40 pitcher rows with a posted line got no playerId and no projection, and the
   full-game simulation priced those real starters at replacement level while its note said they had
   "no posted prop line". Reproduced below with the verbatim names of 2026-10-08 CLE @ CWS (849832):
   board `boards/2026-10-08.json` (provider names, playerId null) and
   `full-game-simulations/2026-10-08.json` (StatsAPI names + ids from the confirmed order).
2. Same name, two players. The dict was last-write-wins across every club on the slate, so "Max Muncy"
   in a Dodgers game resolved to the A's Max Muncy (691777) on 38 committed rows, and was projected
   from that player's logs.

Run:
    python3 -m pipeline.mlb.generate_mlb_board_player_identity_test
"""
from __future__ import annotations

import inspect
import sys

import pipeline.mlb.generate_mlb_board as gmb
from pipeline.mlb.generate_mlb_board import (
    build_identity_pool,
    resolve_player_identity,
    resolve_row_identities,
)

FAILURES: list[str] = []


def check(cond: bool, msg: str) -> None:
    if not cond:
        FAILURES.append(msg)


def roster_entry(pid: int, name: str, pos_type: str = "Outfielder") -> dict:
    return {"person": {"id": pid, "fullName": name}, "position": {"type": pos_type}}


def row(name: str, market: str, away: str, home: str) -> dict:
    return {"playerName": name, "marketKey": market, "awayTeam": away, "homeTeam": home}


CLE, CWS = "Cleveland Guardians", "Chicago White Sox"
LAD, PIT, ATH = "Los Angeles Dodgers", "Pittsburgh Pirates", "Athletics"

# Verbatim from full-game-simulations/2026-10-08.json gamePk 849832 (StatsAPI names + ids).
CLE_ROSTER = [
    roster_entry(680757, "Steven Kwan"),
    roster_entry(608070, "José Ramírez", "Infielder"),
    roster_entry(682657, "Angel Martínez", "Infielder"),
    roster_entry(595978, "Austin Hedges", "Catcher"),
    roster_entry(800048, "Parker Messick", "Pitcher"),
]
CWS_ROSTER = [
    roster_entry(805367, "Chase Meidroth", "Infielder"),
    roster_entry(686668, "Brenton Doyle"),
    roster_entry(696146, "Hagen Smith", "Pitcher"),
]
GAME_849832 = {
    "gamePk": 849832, "awayTeamName": CLE, "homeTeamName": CWS, "awayTeamAbbr": "CLE", "homeTeamAbbr": "CWS",
    "awayProbablePitcherId": 800048, "awayProbablePitcherName": "Parker Messick",
    "homeProbablePitcherId": 696146, "homeProbablePitcherName": "Hagen Smith",
}


def pool_for(*teams: str, people: dict) -> list[dict]:
    out: list[dict] = []
    for t in teams:
        out += people.get(t, [])
    return out


# ── 1. accents: the verbatim 2026-10-08 misses now resolve, to the right id ─────────────────────
people = build_identity_pool([GAME_849832], {CLE: ("CLE", CLE_ROSTER), CWS: ("CWS", CWS_ROSTER)})
game_pool = pool_for(CLE, CWS, people=people)

e, how = resolve_player_identity("Jose Ramirez", game_pool, role="batter")
check(e is not None and e["id"] == 608070 and how == "normalized", f"Jose Ramirez → 608070 normalized, got {e and e['id']} {how}")
check(e is not None and e["teamAbbr"] == "CLE" and e["teamName"] == CLE, "Jose Ramirez attributed to CLE")
e, how = resolve_player_identity("Angel Martinez", game_pool, role="batter")
check(e is not None and e["id"] == 682657, f"Angel Martinez → 682657, got {e and e['id']} {how}")

# exact names keep resolving exactly (no behaviour change for the 3,271 rows that already worked)
e, how = resolve_player_identity("Steven Kwan", game_pool, role="batter")
check(e is not None and e["id"] == 680757 and how == "exact", f"Steven Kwan exact, got {how}")

# case-only difference ("Jonny Deluca" vs "Jonny DeLuca", 26 committed rows)
e, how = resolve_player_identity("Jonny Deluca", [gmb._identity_entry(672275, "Jonny DeLuca", "batter", "TB", "Tampa Bay Rays")], role="batter")
check(e is not None and e["id"] == 672275 and how == "normalized", "case-folded match resolves")

# suffixes are part of identity: "Ronald Acuna Jr." matches "Ronald Acuña Jr." but a bare name does not
acuna = [gmb._identity_entry(660670, "Ronald Acuña Jr.", "batter", "ATL", "Atlanta Braves")]
check(resolve_player_identity("Ronald Acuna Jr.", acuna, role="batter")[0] is not None, "Acuna Jr. resolves")
check(resolve_player_identity("Ronald Acuna", acuna, role="batter") == (None, "unresolved"), "suffix not stripped")

# pitchers: probable pitcher wins the attribution; a roster duplicate of the same id is not ambiguity
people_p = build_identity_pool(
    [{**GAME_849832, "awayProbablePitcherName": "Cristopher Sánchez", "awayProbablePitcherId": 650911}],
    {CLE: ("CLE", [roster_entry(650911, "Cristopher Sánchez", "Pitcher")]), CWS: ("CWS", CWS_ROSTER)},
)
e, how = resolve_player_identity("Cristopher Sanchez", pool_for(CLE, CWS, people=people_p), role="pitcher")
check(e is not None and e["id"] == 650911 and e["probable"] is True and how == "normalized",
      f"probable pitcher with accent resolves to the probable entry, got {e} {how}")

# role separation: a batter market never resolves to a pitcher, and vice versa
check(resolve_player_identity("Parker Messick", game_pool, role="batter") == (None, "unresolved"), "pitcher not a batter")
check(resolve_player_identity("Steven Kwan", game_pool, role="pitcher") == (None, "unresolved"), "batter not a pitcher")

# ── 2. same name, two players ──────────────────────────────────────────────────────────────────
muncy_people = build_identity_pool(
    [],
    {
        LAD: ("LAD", [roster_entry(571970, "Max Muncy", "Infielder")]),
        PIT: ("PIT", [roster_entry(1, "Someone Else")]),
        ATH: ("ATH", [roster_entry(691777, "Max Muncy", "Infielder")]),
    },
)
# A Dodgers game: only LAD + PIT are in the pool, so the A's namesake can never be chosen.
e, how = resolve_player_identity("Max Muncy", pool_for(PIT, LAD, people=muncy_people), role="batter")
check(e is not None and e["id"] == 571970 and e["teamAbbr"] == "LAD", f"LAD game Max Muncy → 571970, got {e and e['id']}")
# Dodgers vs A's: two different people with that name in one game → refused, never guessed.
check(resolve_player_identity("Max Muncy", pool_for(ATH, LAD, people=muncy_people), role="batter") == (None, "ambiguous"),
      "two Max Muncys in one game is ambiguous")
# The provider's own disambiguation tag is not invented into a match.
check(resolve_player_identity("Max Muncy (2002)", pool_for(ATH, LAD, people=muncy_people), role="batter") == (None, "unresolved"),
      "'Max Muncy (2002)' is not guessed")
# Accent-insensitive namesakes are ambiguous too ("Luis Garcia" vs "Luis García")
garcias = [gmb._identity_entry(1, "Luis Garcia", "batter", "A", "A"), gmb._identity_entry(2, "Luis García", "batter", "B", "B")]
check(resolve_player_identity("Luis Garcia", garcias, role="batter") == (None, "ambiguous"), "normalized namesakes ambiguous")

# empty / missing
check(resolve_player_identity("", game_pool, role="batter") == (None, "unresolved"), "empty name")
check(resolve_player_identity("Nobody Here", [], role="batter") == (None, "unresolved"), "empty pool")

# ── 3. rows resolve against THEIR OWN game only ──────────────────────────────────────────────────
rows = [
    row("Jose Ramirez", "batter_hits", CLE, CWS),
    row("Max Muncy", "batter_hits", PIT, LAD),
    row("Max Muncy", "batter_total_bases", ATH, LAD),
    row("Parker Messick", "pitcher_strikeouts", CLE, CWS),
    row("Jose Ramirez", "batter_hits", PIT, LAD),          # name exists on the slate, not in this game
    row("Team Total", "totals", CLE, CWS),                 # not a player market
]
all_people = {**people, **muncy_people}
resolved, summary = resolve_row_identities(rows, all_people)
check(len(resolved) == len(rows), "one result per row")
check(resolved[0] is not None and resolved[0]["id"] == 608070, "row 0 José Ramírez")
check(resolved[1] is not None and resolved[1]["id"] == 571970, "row 1 LAD Muncy")
check(resolved[2] is None, "row 2 LAD vs ATH Muncy refused")
check(resolved[3] is not None and resolved[3]["id"] == 800048 and resolved[3]["probable"], "row 3 probable pitcher")
check(resolved[4] is None, "row 4 a player outside the row's game is never chosen")
check(resolved[5] is None, "row 5 non-player market untouched")
check(summary == {"exact": 2, "normalized": 1, "ambiguous": 1, "unresolved": 1, "ambiguousNames": ["Max Muncy"]},
      f"summary counts, got {summary}")

# ── 4. wiring: run() resolves through these helpers and no longer keeps a name→id dict ──────────
src = inspect.getsource(gmb.run)
check("resolve_row_identities(" in src and "build_identity_pool(" in src, "run() uses the identity helpers")
for stale in ("batter_id_by_name", "pitcher_id_by_name", "player_team_by_name"):
    check(stale not in src, f"run() still has the slate-wide exact-name dict {stale}")


def main() -> int:
    if FAILURES:
        print(f"FAIL — {len(FAILURES)} check(s):")
        for f in FAILURES:
            print(f"  ✗ {f}")
        return 1
    print("ok — MLB board player identity (TRUTH-001)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
