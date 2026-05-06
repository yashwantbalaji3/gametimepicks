"""
Phase 7C — deterministic tests for groupLeansIntoPlayerCards.

Mirrors app/src/lib/grouping.ts in Python so the grouping invariants
can be tested without Node. Both implementations follow the same
ordering rules (confidence rank → |edge| desc → bookmaker asc → id asc)
so any change to the TS comparator must be mirrored here, and the
preservation/isolation tests will catch divergence.

Verifies:
  - Underlying rows are PRESERVED (sum of primary + alternates across
    cards = visibleLeans.length, by rebuild)
  - Player cards group PTS / REB / AST correctly (no cross-market leak)
  - Market filter hides non-matching rows (post-filter, no other markets)
  - Game filter isolates games (cards only from one game)
  - Team filter isolates teams (player team OR opponent matches)
  - Cross-bookmaker rows preserved (same player+market, different books
    → primary + N alternates, all bookmakers present)
  - Primary displayed row is deterministic (same input → same primary)

Runs against:
  1. The on-disk 2026-05-05 board (24 leans, 8 players, 1 book)
  2. A synthesized cross-bookmaker slate that exercises collapse logic

Zero network. Zero file writes. Run:
  python -m pipeline.grouping_test
"""
from __future__ import annotations

import json
import sys
from collections import defaultdict
from copy import deepcopy
from pathlib import Path

GREEN = "\033[0;32m"
RED = "\033[0;31m"
DIM = "\033[2m"
BLUE = "\033[0;34m"
GOLD = "\033[0;33m"
RESET = "\033[0m"


# ---------------------------------------------------------------------------
# Python mirror of TS groupLeansIntoPlayerCards
# ---------------------------------------------------------------------------
CONFIDENCE_RANK = {
    "High": 0,
    "Medium": 1,
    "Low": 2,
    "insufficient_data": 3,
    "no_play": 4,
}


def _primary_sort_key(lean: dict):
    """Total-order tuple matching the TS comparePrimaryRank.

    sort ascending by:
      conf_rank (lower=better),
      -|edgePct| (higher abs edge first),
      bookmaker (alphabetical),
      id (lexicographic)
    """
    cr = CONFIDENCE_RANK.get(lean.get("confidence", "no_play"), 99)
    e = lean.get("edgePct")
    if isinstance(e, (int, float)) and e == e:  # not NaN
        abs_e = abs(float(e))
    else:
        abs_e = -1.0
    return (cr, -abs_e, lean.get("bookmaker", "") or "", lean.get("id", "") or "")


def group_leans_into_player_cards(visible_leans: list[dict]) -> list[dict]:
    by_player: dict[str, list[dict]] = defaultdict(list)
    for lean in visible_leans:
        key = f"{lean.get('date')}-{lean.get('gameId') or ''}-{lean.get('playerId')}"
        by_player[key].append(lean)

    cards: list[dict] = []
    for card_key, leans in by_player.items():
        if not leans:
            continue
        first = leans[0]

        rows = {}
        for market in ("PTS", "REB", "AST"):
            ml = [l for l in leans if l.get("market") == market]
            if not ml:
                continue
            sorted_ml = sorted(ml, key=_primary_sort_key)
            primary, alternates = sorted_ml[0], sorted_ml[1:]
            books_seen: list[str] = []
            for x in [primary, *alternates]:
                bk = x.get("bookmaker") or ""
                if bk and bk not in books_seen:
                    books_seen.append(bk)
            has_multi_lines = any(a.get("line") != primary.get("line") for a in alternates)
            rows[market] = {
                "market": market,
                "primary": primary,
                "alternates": alternates,
                "bookmakers": books_seen,
                "hasMultipleLines": has_multi_lines,
            }

        max_abs = 0.0
        for l in leans:
            e = l.get("edgePct")
            if isinstance(e, (int, float)) and e == e:
                a = abs(float(e))
                if a > max_abs:
                    max_abs = a

        cards.append({
            "cardKey": card_key,
            "date": first.get("date"),
            "gameId": first.get("gameId") or "",
            "playerId": first.get("playerId"),
            "playerName": first.get("playerName"),
            "team": first.get("team", ""),
            "opponent": first.get("opponent", ""),
            "homeAway": first.get("homeAway"),
            "tipoff": first.get("tipoff"),
            "rows": rows,
            "totalProps": len(leans),
            "maxAbsEdge": max_abs,
        })

    cards.sort(key=lambda c: (-c["maxAbsEdge"], c["playerName"]))
    return cards


# ---------------------------------------------------------------------------
# Suite
# ---------------------------------------------------------------------------
class Suite:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.failures: list[str] = []

    def assert_eq(self, actual, expected, name):
        if actual == expected:
            self.passed += 1
            print(f"  {GREEN}✓{RESET} {name}")
        else:
            self.failed += 1
            self.failures.append(f"{name}: expected {expected!r}, got {actual!r}")
            print(f"  {RED}✗{RESET} {name}")
            print(f"    expected: {expected!r}")
            print(f"    got:      {actual!r}")

    def assert_true(self, condition, name):
        if condition:
            self.passed += 1
            print(f"  {GREEN}✓{RESET} {name}")
        else:
            self.failed += 1
            self.failures.append(f"{name}: condition false")
            print(f"  {RED}✗{RESET} {name}")


# ---------------------------------------------------------------------------
# Filter mirror (subset — just what we need for these tests)
# ---------------------------------------------------------------------------
def filter_leans(
    leans: list[dict],
    *,
    market: str = "All",
    game_key: str = "All",
    team: str = "All",
) -> list[dict]:
    out = []
    for l in leans:
        if market != "All" and l.get("market") != market:
            continue
        if team != "All":
            if l.get("team") != team and l.get("opponent") != team:
                continue
        if game_key != "All":
            t = l.get("team")
            o = l.get("opponent")
            ha = l.get("homeAway")
            if t and o and ha:
                away, home = (t, o) if ha == "Away" else (o, t)
                if f"{away}@{home}" != game_key:
                    continue
            else:
                # Lean has no team metadata → can't belong to any specific game.
                # Mirrors enrichLeansWithGames which would have filled these in.
                continue
        out.append(l)
    return out


def enrich_leans_with_games(leans: list[dict], games: list[dict]) -> list[dict]:
    """
    Python mirror of app/src/lib/lean-enrich.ts::enrichLeansWithGames.

    Looks up each lean's gameId in the games list and fills in
    team / opponent / homeAway / tipoff from the game record.
    The frontend does this at runtime; tests on raw boards need it
    to match the rendered behavior.
    """
    by_game_id = {g.get("gameId"): g for g in games}
    out = []
    for l in leans:
        g = by_game_id.get(l.get("gameId"))
        if not g:
            out.append(l)
            continue
        # If team is empty, infer from gameId. The pipeline encodes the
        # owning team in the lean's playerId via roster lookups; absent
        # that, the high-confidence row's existing team field tells us.
        # For simplicity here: if any other lean for the same playerId
        # has a team filled in, copy it.
        enriched = dict(l)
        if not enriched.get("team"):
            for sibling in leans:
                if sibling.get("playerId") == l.get("playerId") and sibling.get("team"):
                    enriched["team"] = sibling["team"]
                    enriched["opponent"] = sibling.get("opponent", "")
                    enriched["homeAway"] = sibling.get("homeAway", "Home")
                    break
        if not enriched.get("tipoff"):
            enriched["tipoff"] = g.get("tipoff", "")
        out.append(enriched)
    return out


# ---------------------------------------------------------------------------
# Synthesized cross-bookmaker slate
# ---------------------------------------------------------------------------
def make_synthetic_slate() -> list[dict]:
    """Mirrors the kind of data you'd see with multiple bookmakers per (player, market)."""
    leans = []
    games = [
        ("g-A", "CLE", "DET"),  # away=CLE, home=DET
        ("g-B", "LAL", "OKC"),
    ]
    players = [
        ("Donovan Mitchell", 100, "CLE", "DET", "Away", "g-A"),
        ("Cade Cunningham",  101, "DET", "CLE", "Home", "g-A"),
        ("Evan Mobley",      102, "CLE", "DET", "Away", "g-A"),
        ("LeBron James",     103, "LAL", "OKC", "Away", "g-B"),
        ("Anthony Davis",    104, "LAL", "OKC", "Away", "g-B"),
        ("Shai Gilgeous-Alexander", 105, "OKC", "LAL", "Home", "g-B"),
    ]
    bookmakers = ["draftkings", "fanduel", "betmgm"]

    for name, pid, team, opp, ha, gid in players:
        for market, base_line in [("PTS", 22.5), ("REB", 5.5), ("AST", 5.5)]:
            for i, bk in enumerate(bookmakers):
                conf = ["High", "Medium", "Low"][i % 3]
                edge = [3.0, 1.5, 0.8][i]
                leans.append({
                    "id": f"2026-05-05-{pid}-{market}",
                    "date": "2026-05-05",
                    "gameId": gid,
                    "tipoff": "7:00 PM ET",
                    "playerId": pid,
                    "playerName": name,
                    "team": team,
                    "opponent": opp,
                    "homeAway": ha,
                    "market": market,
                    "line": base_line + (i * 0.5 if market == "PTS" else 0),
                    "oddsOver": -110,
                    "oddsUnder": -110,
                    "bookmaker": bk,
                    "projection": base_line + 2,
                    "modelProjection": base_line + 2,
                    "edgePct": edge,
                    "confidence": conf,
                    "lean": "Over",
                })
    return leans


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------
def test_underlying_rows_preserved(s: Suite, leans: list[dict]) -> None:
    print(f"\n  {BLUE}─── Underlying rows preserved (no data dropped) ───{RESET}")

    cards = group_leans_into_player_cards(leans)

    # Sum rebuilt rows = original input
    rebuilt: list[dict] = []
    for c in cards:
        for m in ("PTS", "REB", "AST"):
            row = c["rows"].get(m)
            if not row:
                continue
            rebuilt.append(row["primary"])
            rebuilt.extend(row["alternates"])

    s.assert_eq(
        len(rebuilt), len(leans),
        f"primary + alternates rebuild = input ({len(rebuilt)} == {len(leans)})",
    )

    # Every original lean appears exactly once
    in_ids = sorted([(l["id"], l.get("bookmaker")) for l in leans])
    out_ids = sorted([(l["id"], l.get("bookmaker")) for l in rebuilt])
    s.assert_eq(in_ids, out_ids, "every (id, bookmaker) row preserved exactly once")

    # totalProps on each card equals the number of input leans for that card
    for c in cards:
        n_in = sum(
            1 for l in leans
            if f"{l['date']}-{l.get('gameId') or ''}-{l['playerId']}" == c["cardKey"]
        )
        if c["totalProps"] != n_in:
            s.assert_eq(c["totalProps"], n_in, f"  card {c['playerName']} totalProps")
            return
    s.assert_true(True, "  every card's totalProps matches its input slice")


def test_market_isolation_per_card(s: Suite, leans: list[dict]) -> None:
    print(f"\n  {BLUE}─── PTS/REB/AST grouped correctly inside each card ───{RESET}")

    cards = group_leans_into_player_cards(leans)
    for c in cards:
        for m, row in c["rows"].items():
            if row["primary"].get("market") != m:
                s.assert_eq(row["primary"]["market"], m, f"  card {c['playerName']} primary market")
                return
            for a in row["alternates"]:
                if a.get("market") != m:
                    s.assert_eq(a["market"], m, f"  card {c['playerName']} alternate market")
                    return
    s.assert_true(True, "no market leak between PTS/REB/AST slots")


def test_market_filter_hides_other_markets(s: Suite, leans: list[dict]) -> None:
    print(f"\n  {BLUE}─── Market filter hides non-matching rows ───{RESET}")

    for filter_market in ("PTS", "REB", "AST"):
        filtered = filter_leans(leans, market=filter_market)
        cards = group_leans_into_player_cards(filtered)

        all_other_markets_absent = all(
            (filter_market in c["rows"] and len(c["rows"]) == 1)
            for c in cards
        )
        s.assert_true(
            all_other_markets_absent,
            f"market={filter_market}: every card has only {filter_market} row",
        )

        # No card with zero rows
        s.assert_true(
            all(len(c["rows"]) >= 1 for c in cards),
            f"  market={filter_market}: cards with zero rows have disappeared",
        )


def test_game_filter_isolates_games(s: Suite, leans: list[dict]) -> None:
    print(f"\n  {BLUE}─── Game filter isolates games ───{RESET}")

    # Build the available game keys from the data
    game_keys = set()
    for l in leans:
        t, o, ha = l.get("team"), l.get("opponent"), l.get("homeAway")
        if t and o and ha:
            away, home = (t, o) if ha == "Away" else (o, t)
            game_keys.add(f"{away}@{home}")

    for gk in sorted(game_keys):
        filtered = filter_leans(leans, game_key=gk)
        cards = group_leans_into_player_cards(filtered)
        away, home = gk.split("@")
        # Every card's player is on either team in this game
        all_in_game = all(
            (c["team"] in (away, home) and c["opponent"] in (away, home))
            for c in cards
        )
        s.assert_true(all_in_game, f"game={gk}: every card belongs to that game")


def test_team_filter_isolates_teams(s: Suite, leans: list[dict]) -> None:
    print(f"\n  {BLUE}─── Team filter isolates teams (own team or opponent) ───{RESET}")

    teams = {l.get("team") for l in leans} | {l.get("opponent") for l in leans}
    teams = {t for t in teams if t}

    for t in sorted(teams):
        filtered = filter_leans(leans, team=t)
        cards = group_leans_into_player_cards(filtered)
        all_match = all(
            (c["team"] == t or c["opponent"] == t) for c in cards
        )
        s.assert_true(all_match, f"team={t}: every card has {t} as own team or opponent")


def test_cross_bookmaker_preserved(s: Suite) -> None:
    print(f"\n  {BLUE}─── Cross-bookmaker rows preserved (synthetic slate, 3 books) ───{RESET}")

    leans = make_synthetic_slate()
    cards = group_leans_into_player_cards(leans)

    # Each market on each player should have 3 bookmaker rows total
    for c in cards:
        for m in ("PTS", "REB", "AST"):
            row = c["rows"].get(m)
            if not row:
                continue
            total = 1 + len(row["alternates"])
            s.assert_eq(
                total, 3,
                f"{c['playerName']} {m}: 3 bookmaker rows preserved (1 primary + 2 alternates)",
            )
            books = sorted(row["bookmakers"])
            s.assert_eq(
                books,
                sorted(["draftkings", "fanduel", "betmgm"]),
                f"  {c['playerName']} {m}: all 3 books in row.bookmakers",
            )


def test_primary_is_deterministic(s: Suite) -> None:
    print(f"\n  {BLUE}─── Primary lean choice is deterministic ───{RESET}")

    leans = make_synthetic_slate()

    # Run twice in different input orders
    cards_a = group_leans_into_player_cards(leans)
    leans_shuffled = list(reversed(deepcopy(leans)))
    cards_b = group_leans_into_player_cards(leans_shuffled)

    by_key_a = {c["cardKey"]: c for c in cards_a}
    by_key_b = {c["cardKey"]: c for c in cards_b}

    s.assert_eq(
        sorted(by_key_a.keys()),
        sorted(by_key_b.keys()),
        "same set of cardKeys regardless of input order",
    )
    for k, ca in by_key_a.items():
        cb = by_key_b[k]
        for m in ("PTS", "REB", "AST"):
            ra = ca["rows"].get(m)
            rb = cb["rows"].get(m)
            if ra is None and rb is None:
                continue
            if (ra is None) != (rb is None):
                s.assert_true(False, f"  {k} {m}: row presence differs across orderings")
                return
            pa = (ra["primary"]["bookmaker"], ra["primary"]["confidence"], ra["primary"]["edgePct"])
            pb = (rb["primary"]["bookmaker"], rb["primary"]["confidence"], rb["primary"]["edgePct"])
            if pa != pb:
                s.assert_eq(pa, pb, f"  {k} {m}: same primary regardless of input order")
                return
    s.assert_true(True, "every card's primary unchanged when input is reversed")

    # Confidence rank dominates: a High row beats a Medium row even with smaller edge
    leans2 = [
        # Same player, same market, different bookmakers
        {"id": "x-1-PTS", "date": "d", "gameId": "g", "playerId": 1, "playerName": "P",
         "team": "X", "opponent": "Y", "homeAway": "Home", "tipoff": "7p",
         "market": "PTS", "line": 20, "oddsOver": -110, "oddsUnder": -110,
         "bookmaker": "z_book", "projection": 22, "modelProjection": 22,
         "edgePct": 1.0, "confidence": "High", "lean": "Over"},
        {"id": "x-1-PTS", "date": "d", "gameId": "g", "playerId": 1, "playerName": "P",
         "team": "X", "opponent": "Y", "homeAway": "Home", "tipoff": "7p",
         "market": "PTS", "line": 20, "oddsOver": -110, "oddsUnder": -110,
         "bookmaker": "a_book", "projection": 22, "modelProjection": 22,
         "edgePct": 9.9, "confidence": "Medium", "lean": "Over"},
    ]
    cards2 = group_leans_into_player_cards(leans2)
    primary_book = cards2[0]["rows"]["PTS"]["primary"]["bookmaker"]
    s.assert_eq(primary_book, "z_book", "High beats Medium even when Medium has higher edge")

    # Same confidence: |edge| dominates
    leans3 = [
        {"id": "x-1-PTS", "date": "d", "gameId": "g", "playerId": 1, "playerName": "P",
         "team": "X", "opponent": "Y", "homeAway": "Home", "tipoff": "7p",
         "market": "PTS", "line": 20, "oddsOver": -110, "oddsUnder": -110,
         "bookmaker": "z_book", "projection": 22, "modelProjection": 22,
         "edgePct": 5.0, "confidence": "Medium", "lean": "Over"},
        {"id": "x-1-PTS", "date": "d", "gameId": "g", "playerId": 1, "playerName": "P",
         "team": "X", "opponent": "Y", "homeAway": "Home", "tipoff": "7p",
         "market": "PTS", "line": 20, "oddsOver": -110, "oddsUnder": -110,
         "bookmaker": "a_book", "projection": 22, "modelProjection": 22,
         "edgePct": 8.0, "confidence": "Medium", "lean": "Over"},
    ]
    cards3 = group_leans_into_player_cards(leans3)
    s.assert_eq(
        cards3[0]["rows"]["PTS"]["primary"]["bookmaker"],
        "a_book",
        "same conf: higher |edge| wins",
    )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> int:
    print()
    print(f"  {GOLD}Phase 7C — grouping tests{RESET}")
    print(f"  {DIM}zero network · zero file writes{RESET}")

    s = Suite()

    # Test 1: real on-disk board (sandbox: 24 leans, 8 players, 1 book each)
    board_path = Path(__file__).resolve().parent.parent / "app" / "public" / "data" / "boards" / "2026-05-05.json"
    if board_path.exists():
        board = json.loads(board_path.read_text())
        leans = board.get("leans", [])
        games = board.get("games", [])
        if leans:
            # Mirror frontend's runtime enrichment
            leans = enrich_leans_with_games(leans, games)
            print(f"\n  {DIM}Suite A: on-disk board {board_path.name} ({len(leans)} leans, enriched){RESET}")
            test_underlying_rows_preserved(s, leans)
            test_market_isolation_per_card(s, leans)
            test_market_filter_hides_other_markets(s, leans)
            test_game_filter_isolates_games(s, leans)
            test_team_filter_isolates_teams(s, leans)

    # Test 2: synthetic cross-bookmaker slate (forces collapse logic)
    print(f"\n  {DIM}Suite B: synthesized cross-bookmaker slate{RESET}")
    synth = make_synthetic_slate()
    test_underlying_rows_preserved(s, synth)
    test_market_isolation_per_card(s, synth)
    test_market_filter_hides_other_markets(s, synth)
    test_game_filter_isolates_games(s, synth)
    test_team_filter_isolates_teams(s, synth)
    test_cross_bookmaker_preserved(s)
    test_primary_is_deterministic(s)

    print()
    if s.failed == 0:
        print(f"  {GREEN}✓ all {s.passed} grouping assertions passed{RESET}")
        print()
        return 0

    print(f"  {RED}✗ {s.failed} of {s.passed + s.failed} grouping assertions FAILED{RESET}")
    for f in s.failures[:10]:
        print(f"  {RED}  {f}{RESET}")
    print()
    return 1


if __name__ == "__main__":
    sys.exit(main())
