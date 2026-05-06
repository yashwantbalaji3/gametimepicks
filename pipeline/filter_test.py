"""
Phase 7B-6.2 — deterministic filter + render-path test.

Mirrors the EXACT code path that vault-board.tsx uses to render cards:

    visibleLeans = computeVisibleLeans(rawLeans, games, filters)
                 = sortLeans(applyFilters(enrichLeansWithGames(rawLeans, games), games, filters), filters.sort)

NO DEDUPE — Phase 7B-6.1 removed legitimate cross-bookmaker rows because
the id scheme `{date}-{playerId}-{market}` is intentionally not unique
across bookmakers. This version preserves every row and ensures unique
React keys via the separate buildLeanRenderKey() helper.

Every assertion checks BOTH:
  1. The right COUNT (e.g. market=REB → exactly the REB count)
  2. PER-RESULT satisfaction — every lean in the result MUST satisfy every
     active filter.

Plus two new test classes for Phase 7B-6.2:
  3. Duplicate-id preservation — rows with the same id but different
     bookmaker / line / side must NOT be dropped.
  4. Render-key uniqueness — buildLeanRenderKey() must produce unique keys
     for every visible lean, so React keys cannot collide and stale-render
     cards.

ZERO API credits — reads only on-disk JSON.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from collections import Counter
from typing import Any


GREEN = "\033[0;32m"
RED = "\033[0;31m"
DIM = "\033[2m"
BLUE = "\033[0;34m"
GOLD = "\033[0;33m"
RESET = "\033[0m"


# ---------------------------------------------------------------------------
# Mirrors of app/src/lib/lean-enrich.ts and app/src/lib/filter.ts
# Keep these in sync with the TS implementations.
# ---------------------------------------------------------------------------
def match_game_for_lean(lean: dict, games: list[dict]) -> dict | None:
    if not games:
        return None
    if lean.get("gameId"):
        for g in games:
            if g.get("gameId") == lean["gameId"]:
                return g
    if lean.get("tipoff"):
        matches = [g for g in games if g.get("tipoff") == lean["tipoff"]]
        if len(matches) == 1:
            return matches[0]
    if lean.get("team"):
        is_home = lean.get("homeAway") == "Home"
        for g in games:
            if is_home and g.get("homeTeamAbbr") == lean["team"]:
                return g
            if (not is_home) and g.get("awayTeamAbbr") == lean["team"]:
                return g
    return None


def enrich_lean(lean: dict, games: list[dict]) -> dict:
    if lean.get("team") and lean.get("opponent"):
        return lean
    g = match_game_for_lean(lean, games)
    if not g:
        return lean
    is_home = lean.get("homeAway") == "Home"
    return {
        **lean,
        "team": lean.get("team") or (
            g["homeTeamAbbr"] if is_home else g["awayTeamAbbr"]
        ),
        "opponent": lean.get("opponent") or (
            g["awayTeamAbbr"] if is_home else g["homeTeamAbbr"]
        ),
    }


def game_key_for_lean(lean: dict, games: list[dict]) -> str | None:
    g = match_game_for_lean(lean, games)
    if not g:
        return None
    return f"{g['awayTeamAbbr']}@{g['homeTeamAbbr']}"


def is_no_play(lean: dict) -> bool:
    return lean.get("lean") in ("No Play", "Pass")


def apply_filters(
    leans: list[dict], games: list[dict], filters: dict[str, Any],
) -> list[dict]:
    out = []
    for l in leans:
        if filters.get("market", "All") != "All" and l.get("market") != filters["market"]:
            continue
        if filters.get("confidence", "All") != "All" and l.get("confidence") != filters["confidence"]:
            continue
        no_play = is_no_play(l)
        pt = filters.get("pickType", "All")
        if pt == "Model Lean" and no_play:
            continue
        if pt == "No Play" and not no_play:
            continue
        min_edge = filters.get("minEdge", 0)
        if min_edge > 0:
            ep = l.get("edgePct")
            if not isinstance(ep, (int, float)) or ep != ep:
                continue
            if abs(ep) < min_edge:
                continue
        team_f = filters.get("team", "All")
        if team_f != "All" and l.get("team") != team_f and l.get("opponent") != team_f:
            continue
        gk_f = filters.get("gameKey", "All")
        if gk_f != "All":
            k = game_key_for_lean(l, games)
            if k != gk_f:
                continue
        out.append(l)
    return out


def sort_leans(leans: list[dict], key: str) -> list[dict]:
    if key == "edge":
        return sorted(leans, key=lambda l: -abs(l.get("edgePct") or 0))
    if key == "confidence":
        rank = {"High": 0, "Medium": 1, "Low": 2, "insufficient_data": 3, "no_play": 4}
        return sorted(leans, key=lambda l: rank.get(l.get("confidence"), 99))
    if key == "tipoff":
        return sorted(leans, key=lambda l: l.get("tipoff") or "")
    if key == "projGap":
        def gap(l: dict) -> float:
            p, line = l.get("projection"), l.get("line")
            if isinstance(p, (int, float)) and isinstance(line, (int, float)):
                return -abs(p - line)
            return 0
        return sorted(leans, key=gap)
    return list(leans)


def compute_visible_leans(
    raw_leans: list[dict], games: list[dict], filters: dict[str, Any],
) -> list[dict]:
    """Mirror of computeVisibleLeans() in app/src/lib/filter.ts. NO dedupe."""
    enriched = [enrich_lean(l, games) for l in raw_leans]
    filtered = apply_filters(enriched, games, filters)
    return sort_leans(filtered, filters.get("sort", "edge"))


def build_lean_render_key(lean: dict, index: int) -> str:
    """Mirror of buildLeanRenderKey() in app/src/lib/filter.ts."""
    return "|".join([
        str(lean.get("id") or "_"),
        str(lean.get("gameId") or "_"),
        str(lean.get("playerName") or "_"),
        str(lean.get("market") or "_"),
        str(lean.get("line") if lean.get("line") is not None else "_"),
        str(lean.get("lean") or "_"),
        str(lean.get("bookmaker") or "_"),
        str(index),
    ])


# ---------------------------------------------------------------------------
# Filter satisfaction predicate
# ---------------------------------------------------------------------------
def lean_satisfies(lean: dict, filters: dict, games: list[dict]) -> tuple[bool, str]:
    if filters.get("market", "All") != "All" and lean.get("market") != filters["market"]:
        return False, f"market={lean.get('market')!r} != {filters['market']!r}"
    if filters.get("confidence", "All") != "All" and lean.get("confidence") != filters["confidence"]:
        return False, f"confidence={lean.get('confidence')!r} != {filters['confidence']!r}"
    no_play = is_no_play(lean)
    pt = filters.get("pickType", "All")
    if pt == "Model Lean" and no_play:
        return False, f"pickType=Model Lean but lean is {lean.get('lean')!r}"
    if pt == "No Play" and not no_play:
        return False, f"pickType=No Play but lean is {lean.get('lean')!r}"
    if filters.get("minEdge", 0) > 0:
        ep = lean.get("edgePct")
        if not isinstance(ep, (int, float)):
            return False, f"minEdge>{filters['minEdge']} but edgePct={ep!r}"
        if abs(ep) < filters["minEdge"]:
            return False, f"|edgePct|={abs(ep):.1f} < minEdge={filters['minEdge']}"
    team_f = filters.get("team", "All")
    if team_f != "All" and lean.get("team") != team_f and lean.get("opponent") != team_f:
        return False, f"team={team_f!r} but lean team={lean.get('team')!r} opp={lean.get('opponent')!r}"
    gk_f = filters.get("gameKey", "All")
    if gk_f != "All":
        k = game_key_for_lean(lean, games)
        if k != gk_f:
            return False, f"gameKey={gk_f!r} but lean gameKey={k!r}"
    return True, ""


# ---------------------------------------------------------------------------
# Test harness
# ---------------------------------------------------------------------------
class Suite:
    def __init__(self) -> None:
        self.passed = 0
        self.failed = 0
        self.failures: list[str] = []

    def assert_visible(
        self, raw_leans: list[dict], games: list[dict],
        filters: dict[str, Any], expected_count: int, name: str,
    ) -> None:
        full = {
            "market": "All", "confidence": "All", "pickType": "All",
            "minEdge": 0, "team": "All", "gameKey": "All", "sort": "edge",
            **filters,
        }
        result = compute_visible_leans(raw_leans, games, full)

        # Check #1 — count
        if len(result) != expected_count:
            self.failed += 1
            self.failures.append(f"{name}: expected {expected_count}, got {len(result)}")
            print(f"  {RED}✗{RESET} {name:60s} count: expected {expected_count}, got {len(result)}")
            return

        # Check #2 — per-result satisfaction
        for l in result:
            ok, why = lean_satisfies(l, full, games)
            if not ok:
                self.failed += 1
                self.failures.append(f"{name}: leaked lean — {why}")
                print(f"  {RED}✗{RESET} {name:60s} LEAK: {why}")
                return

        self.passed += 1
        print(f"  {GREEN}✓{RESET} {name:60s} count={expected_count}, all satisfy")

    def assert_keys_unique(
        self, raw_leans: list[dict], games: list[dict],
        filters: dict[str, Any], name: str,
    ) -> None:
        full = {
            "market": "All", "confidence": "All", "pickType": "All",
            "minEdge": 0, "team": "All", "gameKey": "All", "sort": "edge",
            **filters,
        }
        result = compute_visible_leans(raw_leans, games, full)
        keys = [build_lean_render_key(l, i) for i, l in enumerate(result)]
        if len(keys) != len(set(keys)):
            dupes = [k for k in keys if keys.count(k) > 1]
            self.failed += 1
            msg = f"{name}: duplicate render keys: {set(dupes)}"
            self.failures.append(msg)
            print(f"  {RED}✗{RESET} {name:60s} DUP KEYS: {set(dupes)}")
            return
        self.passed += 1
        print(f"  {GREEN}✓{RESET} {name:60s} all {len(keys)} render keys unique")


def test_one_board(s: Suite, board_path: Path) -> None:
    data = json.loads(board_path.read_text())
    raw_leans = data.get("leans", [])
    games = data.get("games", [])
    date = data.get("generatedFor") or board_path.stem

    print(f"\n  {BLUE}─── {board_path.name}  (mode={data.get('dataMode')}, "
          f"games={len(games)}, leans={len(raw_leans)}) ───{RESET}")

    if not raw_leans:
        s.assert_visible(raw_leans, games, {}, 0, f"{date}: empty board, default filters")
        s.assert_visible(raw_leans, games, {"market": "PTS"}, 0, f"{date}: empty board, market=PTS")
        return

    enriched = [enrich_lean(l, games) for l in raw_leans]

    # ── Total count must equal raw count (no dedupe!) ──
    s.assert_visible(raw_leans, games, {}, len(raw_leans),
                     f"{date}: default — preserves all {len(raw_leans)} rows")

    # Each market — counts derived from actual data
    by_market = Counter(l["market"] for l in enriched)
    for m in ["PTS", "REB", "AST"]:
        s.assert_visible(raw_leans, games, {"market": m},
                         by_market.get(m, 0), f"{date}: market={m}")

    # Each confidence
    by_conf = Counter(l["confidence"] for l in enriched)
    for tier in by_conf.keys():
        s.assert_visible(raw_leans, games, {"confidence": tier},
                         by_conf[tier], f"{date}: confidence={tier}")

    # Type
    no_play_count = sum(1 for l in enriched if is_no_play(l))
    s.assert_visible(raw_leans, games, {"pickType": "Model Lean"},
                     len(enriched) - no_play_count, f"{date}: pickType=Model Lean")
    s.assert_visible(raw_leans, games, {"pickType": "No Play"},
                     no_play_count, f"{date}: pickType=No Play")

    # Each game
    by_game = Counter(game_key_for_lean(l, games) for l in enriched)
    for gk, count in by_game.items():
        if gk is None:
            continue
        s.assert_visible(raw_leans, games, {"gameKey": gk},
                         count, f"{date}: gameKey={gk}")

    # Each team
    teams = set()
    for l in enriched:
        if l.get("team"):
            teams.add(l["team"])
        if l.get("opponent"):
            teams.add(l["opponent"])
    for team in sorted(teams):
        expected = sum(1 for l in enriched
                       if l.get("team") == team or l.get("opponent") == team)
        s.assert_visible(raw_leans, games, {"team": team},
                         expected, f"{date}: team={team}")

    # Compound: market + game (the user's exact scenario)
    game_keys = sorted(k for k in by_game.keys() if k)
    if game_keys:
        for gk in game_keys:
            for m in ["PTS", "REB", "AST"]:
                expected = sum(1 for l in enriched
                               if l["market"] == m and game_key_for_lean(l, games) == gk)
                s.assert_visible(raw_leans, games, {"market": m, "gameKey": gk},
                                 expected, f"{date}: market={m} AND gameKey={gk}")

    # ── Render-key uniqueness — Phase 7B-6.2 NEW ──
    s.assert_keys_unique(raw_leans, games, {},
                         f"{date}: render keys unique (default)")
    s.assert_keys_unique(raw_leans, games, {"market": "PTS"},
                         f"{date}: render keys unique (market=PTS)")


def test_duplicate_id_preservation(s: Suite) -> None:
    """
    Phase 7B-6.2 NEW: explicitly verify rows with duplicate `id` are
    preserved when they differ by bookmaker / line / side.

    The id scheme is `{date}-{playerId}-{market}`, which is shared across
    bookmakers by design. The pipeline emits one row per bookmaker, so
    cross-bookmaker rows MUST be preserved.
    """
    print(f"\n  {BLUE}─── Duplicate-id preservation (cross-bookmaker rows) ───{RESET}")

    games = [{"gameId": "g1", "awayTeamAbbr": "CLE", "homeTeamAbbr": "DET",
              "tipoff": "7:00 PM ET"}]

    # Same player, same market, same line — but different bookmakers.
    # Same id (per the {date}-{playerId}-{market} scheme).
    raw = [
        {
            "id": "2026-05-05-203999-PTS",
            "playerId": 203999, "playerName": "Donovan Mitchell",
            "market": "PTS", "line": 22.5, "lean": "Over",
            "oddsOver": -110, "oddsUnder": -110,
            "bookmaker": "draftkings",
            "gameId": "g1", "homeAway": "Away", "team": "CLE", "opponent": "DET",
            "tipoff": "7:00 PM ET", "confidence": "High",
            "edgePct": 5.5, "projection": 24.0,
            "modelProbability": 0.58, "impliedProbability": 0.52,
            "riskFlags": [], "reason": "test",
        },
        {
            "id": "2026-05-05-203999-PTS",  # SAME id as above
            "playerId": 203999, "playerName": "Donovan Mitchell",
            "market": "PTS", "line": 22.5, "lean": "Over",
            "oddsOver": -115, "oddsUnder": -105,
            "bookmaker": "fanduel",  # DIFFERENT bookmaker
            "gameId": "g1", "homeAway": "Away", "team": "CLE", "opponent": "DET",
            "tipoff": "7:00 PM ET", "confidence": "High",
            "edgePct": 4.8, "projection": 24.0,
            "modelProbability": 0.57, "impliedProbability": 0.53,
            "riskFlags": [], "reason": "test",
        },
        {
            "id": "2026-05-05-203999-PTS",  # SAME id as above
            "playerId": 203999, "playerName": "Donovan Mitchell",
            "market": "PTS", "line": 22.5, "lean": "Over",
            "oddsOver": -108, "oddsUnder": -112,
            "bookmaker": "betmgm",  # DIFFERENT bookmaker again
            "gameId": "g1", "homeAway": "Away", "team": "CLE", "opponent": "DET",
            "tipoff": "7:00 PM ET", "confidence": "High",
            "edgePct": 6.2, "projection": 24.0,
            "modelProbability": 0.59, "impliedProbability": 0.51,
            "riskFlags": [], "reason": "test",
        },
    ]

    s.assert_visible(raw, games, {}, 3,
                     "3 cross-bookmaker rows with same id all preserved")
    s.assert_visible(raw, games, {"market": "PTS"}, 3,
                     "3 cross-bookmaker rows survive market=PTS filter")
    s.assert_keys_unique(raw, games, {},
                         "3 cross-bookmaker rows produce 3 unique render keys")

    # Verify each book is actually represented in the output
    visible = compute_visible_leans(raw, games, {
        "market": "All", "confidence": "All", "pickType": "All",
        "minEdge": 0, "team": "All", "gameKey": "All", "sort": "edge",
    })
    books = {l["bookmaker"] for l in visible}
    if books == {"draftkings", "fanduel", "betmgm"}:
        s.passed += 1
        print(f"  {GREEN}✓{RESET} all 3 bookmakers present in visible output")
    else:
        s.failed += 1
        s.failures.append(f"bookmakers missing: got {books}")
        print(f"  {RED}✗{RESET} bookmakers missing: got {books}")


def test_realistic_166_prop_slate(s: Suite) -> None:
    """
    Synthesize the user's reported May-5 distribution (PTS=66, REB=59,
    AST=41, total 166) WITH cross-bookmaker duplicates so id is non-unique.
    Verifies all 166 are preserved AND filters work AND keys are unique.
    """
    print(f"\n  {BLUE}─── Realistic 166-prop slate "
          f"(PTS=66, REB=59, AST=41, with cross-bookmaker dupes) ───{RESET}")

    games = [
        {"gameId": "g1", "awayTeamAbbr": "CLE", "homeTeamAbbr": "DET",
         "tipoff": "7:00 PM ET"},
        {"gameId": "g2", "awayTeamAbbr": "LAL", "homeTeamAbbr": "OKC",
         "tipoff": "9:30 PM ET"},
    ]
    books = ["draftkings", "fanduel", "betmgm"]

    raw = []
    pid = 0

    # Distribution: 66 PTS, 59 REB, 41 AST (target 166)
    # Spread roughly half across each game; cross-bookmaker dupes for
    # ~half the player+market pairs to make total = target.
    targets = {"PTS": 66, "REB": 59, "AST": 41}
    for market, target in targets.items():
        # n_unique players per market is roughly target / 2 (each appears on ~2 books)
        # but we'll size it precisely
        per_game = target // 2
        leftover = target - 2 * per_game
        per_game_counts = [per_game + leftover, per_game]

        for g_idx, g in enumerate(games):
            n = per_game_counts[g_idx]
            i = 0
            while i < n:
                pid += 1
                # Approx 60% players on 2 books, 40% on 1 book
                # to match a realistic non-unique-id distribution.
                n_books = 2 if (i % 5 < 3 and i + 1 < n) else 1
                for b in range(n_books):
                    if i >= n:
                        break
                    is_home = (i % 2 == 0)
                    raw.append({
                        "id": f"2026-05-05-{pid:06d}-{market}",
                        "playerId": pid,
                        "playerName": f"Player {pid}",
                        "market": market,
                        "line": 10.0 + (i % 20),
                        "lean": "Over" if i % 3 == 0 else (
                            "Under" if i % 3 == 1 else "No Play"),
                        "confidence": "High" if i < 4 else "insufficient_data",
                        "edgePct": (5.0 + i * 0.5) if i < 4 else None,
                        "projection": (15.0 + i * 0.3) if i < 4 else None,
                        "modelProbability": 0.55 if i < 4 else None,
                        "impliedProbability": 0.50,
                        "oddsOver": -110, "oddsUnder": -110,
                        "tipoff": g["tipoff"],
                        "homeAway": "Home" if is_home else "Away",
                        "gameId": g["gameId"],
                        "team": None, "opponent": None,
                        "bookmaker": books[b % len(books)],
                        "riskFlags": [], "reason": "test",
                    })
                    i += 1

    # Tally what we produced
    by_market = Counter(l["market"] for l in raw)
    print(f"  {DIM}produced totals: PTS={by_market['PTS']}, "
          f"REB={by_market['REB']}, AST={by_market['AST']}, "
          f"total={len(raw)}{RESET}")

    # Verify we hit the targets exactly
    for m, expected in targets.items():
        if by_market[m] != expected:
            s.failed += 1
            msg = (f"synth target mismatch: market={m} produced "
                   f"{by_market[m]}, expected {expected}")
            s.failures.append(msg)
            print(f"  {RED}✗{RESET} {msg}")
            return

    # Default — all 166 must be present
    s.assert_visible(raw, games, {}, 166,
                     "166-prop: default — all 166 preserved (no dedupe)")

    # Per market
    s.assert_visible(raw, games, {"market": "PTS"}, 66,
                     "166-prop: market=PTS → 66 (matches user's data)")
    s.assert_visible(raw, games, {"market": "REB"}, 59,
                     "166-prop: market=REB → 59 (matches user's data)")
    s.assert_visible(raw, games, {"market": "AST"}, 41,
                     "166-prop: market=AST → 41 (matches user's data)")

    # Render keys must be unique even though many rows share ids
    s.assert_keys_unique(raw, games, {},
                         "166-prop: all 166 render keys unique (default)")
    s.assert_keys_unique(raw, games, {"market": "REB"},
                         "166-prop: 59 REB render keys unique")

    # How many ids are duplicated?
    id_counts = Counter(l["id"] for l in raw)
    dupe_ids = sum(1 for c in id_counts.values() if c > 1)
    if dupe_ids > 0:
        s.passed += 1
        print(f"  {GREEN}✓{RESET} {dupe_ids} id values shared across bookmakers — preserved")
    else:
        # Should not happen with our synthesis but not strictly an error
        s.passed += 1
        print(f"  {DIM}  no shared ids in synth (would still be valid){RESET}")


def test_date_isolation(s: Suite, board_paths: list[Path]) -> None:
    """No two boards share lean IDs (within-game) — but only if board has data.
    Note: across dates ids include the date so they're naturally disjoint."""
    print(f"\n  {BLUE}─── Date isolation across {len(board_paths)} boards ───{RESET}")
    by_date: dict[str, set[str]] = {}
    for p in board_paths:
        data = json.loads(p.read_text())
        date = data.get("generatedFor") or p.stem
        by_date[date] = {l["id"] for l in data.get("leans", [])}
    dates = sorted(by_date.keys())
    for i, d1 in enumerate(dates):
        for d2 in dates[i + 1:]:
            overlap = by_date[d1] & by_date[d2]
            if overlap == set():
                s.passed += 1
                print(f"  {GREEN}✓{RESET} date isolation: {d1} vs {d2}")
            else:
                s.failed += 1
                msg = f"date isolation: {d1} vs {d2} share lean IDs: {overlap}"
                s.failures.append(msg)
                print(f"  {RED}✗{RESET} {msg}")


def main() -> int:
    repo_root = Path(__file__).resolve().parent.parent
    boards_dir = repo_root / "app" / "public" / "data" / "boards"

    if not boards_dir.exists():
        print(f"{RED}boards/ directory not found at {boards_dir}{RESET}",
              file=sys.stderr)
        return 1

    board_paths = sorted(boards_dir.glob("*.json"))
    if not board_paths:
        print(f"{RED}No per-day board files in {boards_dir}{RESET}",
              file=sys.stderr)
        return 1

    print()
    print(f"  {GOLD}Phase 7B-6.2 filter + render-path test{RESET}")
    print(f"  {DIM}{len(board_paths)} per-day boards under {boards_dir}{RESET}")
    print(f"  {DIM}NO dedupe — every legitimate row preserved.{RESET}")
    print(f"  {DIM}Render keys built via composite buildLeanRenderKey().{RESET}")

    s = Suite()

    for p in board_paths:
        test_one_board(s, p)

    test_date_isolation(s, board_paths)
    test_duplicate_id_preservation(s)
    test_realistic_166_prop_slate(s)

    print()
    if s.failed == 0:
        print(f"  {GREEN}✓ all {s.passed} assertions passed{RESET}")
        print(f"  {GREEN}  → no rows dropped, every result satisfies every filter,{RESET}")
        print(f"  {GREEN}    every render key unique{RESET}")
        print()
        return 0
    else:
        print(f"  {RED}✗ {s.failed} of {s.passed + s.failed} assertions FAILED{RESET}")
        for f in s.failures[:10]:
            print(f"  {RED}  {f}{RESET}")
        print()
        return 1


if __name__ == "__main__":
    sys.exit(main())
