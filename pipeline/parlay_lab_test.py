"""
Phase 12 — pipeline.parlay_lab_test

Tests the Parlay Lab matching logic by porting the rules from
`app/src/lib/parlay.ts` into Python and asserting the behavior.
The TypeScript and Python implementations MUST stay in sync — when
either changes, both should change.

Zero network. Zero filesystem mutation.
"""
from __future__ import annotations

import re
import unicodedata


# ---------------------------------------------------------------------------
# Python ports of the TS helpers (must mirror parlay.ts)
# ---------------------------------------------------------------------------

_NON_ALNUM = re.compile(r"[^a-z0-9]+")
_LEAD_TRAIL_UNDERSCORE = re.compile(r"^_+|_+$")


def normalize_name(name: str) -> str:
    decomposed = unicodedata.normalize("NFD", name)
    stripped = "".join(c for c in decomposed if unicodedata.category(c) != "Mn")
    lowered = stripped.lower()
    underscored = _NON_ALNUM.sub("_", lowered)
    return _LEAD_TRAIL_UNDERSCORE.sub("", underscored)


def american_to_implied(odds: float) -> float:
    if odds == 0:
        return 0.0
    if odds > 0:
        return 100.0 / (odds + 100.0)
    return -odds / (-odds + 100.0)


def parse_pasted_line(line: str) -> dict | None:
    """Mirror of parsePastedLine in parlay.ts."""
    cleaned = line.strip()
    if not cleaned or cleaned.startswith("#"):
        return None

    market_match = re.search(
        r"\b(PTS|REB|AST|points?|rebounds?|assists?)\b", cleaned, re.IGNORECASE
    )
    if not market_match:
        return None
    raw_market = market_match.group(0).lower()
    if raw_market.startswith("pt") or raw_market == "points":
        market = "PTS"
    elif raw_market.startswith("re"):
        market = "REB"
    else:
        market = "AST"

    side_match = re.search(r"\b(Over|Under|O|U)\b", cleaned, re.IGNORECASE)
    if not side_match:
        return None
    side = "Over" if side_match.group(0).lower().startswith("o") else "Under"

    numbers = [
        (float(m.group(0)), m.group(0), m.start())
        for m in re.finditer(r"-?\d+(?:\.\d+)?", cleaned)
    ]
    if not numbers:
        return None

    line_candidate = next(
        (n for n in numbers if 0 <= n[0] < 100 and not n[1].startswith("-")),
        None,
    )
    if not line_candidate:
        return None
    line_value = line_candidate[0]

    odds_candidate = next(
        (n for n in numbers if abs(n[0]) >= 100), None
    )
    odds_value = odds_candidate[0] if odds_candidate else None

    stop_pos = min(
        side_match.start() if side_match.start() >= 0 else len(cleaned),
        market_match.start() if market_match.start() >= 0 else len(cleaned),
    )
    raw_player_name = cleaned[:stop_pos].strip()
    raw_player_name = re.sub(r"[—–\-:|]+$", "", raw_player_name).strip()

    if not raw_player_name:
        return None

    return {
        "rawPlayerName": raw_player_name,
        "market": market,
        "side": side,
        "line": line_value,
        "oddsAmerican": odds_value,
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def main() -> int:
    asserts = 0

    # ── Test 1: name normalization parity with TS ─────────────────────────
    assert normalize_name("LeBron James") == "lebron_james"
    assert normalize_name("Nikola Jokić") == "nikola_jokic"
    assert normalize_name("Shai Gilgeous-Alexander") == "shai_gilgeous_alexander"
    asserts += 3

    # ── Test 2: parse standard format ─────────────────────────────────────
    p = parse_pasted_line("LeBron James Over 25.5 PTS -110")
    assert p is not None
    assert p["rawPlayerName"] == "LeBron James"
    assert p["market"] == "PTS"
    assert p["side"] == "Over"
    assert p["line"] == 25.5
    assert p["oddsAmerican"] == -110.0
    asserts += 6

    # ── Test 3: parse without odds ────────────────────────────────────────
    p = parse_pasted_line("Donovan Mitchell Under 5.5 AST")
    assert p is not None
    assert p["rawPlayerName"] == "Donovan Mitchell"
    assert p["market"] == "AST"
    assert p["side"] == "Under"
    assert p["line"] == 5.5
    assert p["oddsAmerican"] is None
    asserts += 5

    # ── Test 4: parse with positive odds ──────────────────────────────────
    p = parse_pasted_line("Anthony Davis Over 9.5 REB +120")
    assert p is not None
    assert p["oddsAmerican"] == 120.0
    asserts += 2

    # ── Test 5: parse with market keyword written out ─────────────────────
    p = parse_pasted_line("LeBron James Over 25.5 points")
    assert p is not None
    assert p["market"] == "PTS"
    asserts += 2

    # ── Test 6: parse handles dash separators in name ─────────────────────
    p = parse_pasted_line("Shai Gilgeous-Alexander Over 28.5 PTS")
    assert p is not None
    assert p["rawPlayerName"] == "Shai Gilgeous-Alexander"
    assert p["line"] == 28.5
    asserts += 3

    # ── Test 7: comments are ignored ──────────────────────────────────────
    assert parse_pasted_line("# this is a comment") is None
    assert parse_pasted_line("") is None
    assert parse_pasted_line("   ") is None
    asserts += 3

    # ── Test 8: lines without sufficient info return None ─────────────────
    assert parse_pasted_line("LeBron James") is None  # no market, no side, no line
    assert parse_pasted_line("Some Random Text PTS") is None  # no side, no line
    assert parse_pasted_line("Over Under 5.5 PTS") is None  # no name (or just "")
    asserts += 3

    # ── Test 9: American → implied probability conversion ─────────────────
    # -110 American = 110 / 210 = ~0.5238
    assert abs(american_to_implied(-110) - 0.5238) < 0.001
    # +100 American = 100 / 200 = 0.5
    assert abs(american_to_implied(100) - 0.5) < 0.001
    # +120 American = 100 / 220 = ~0.4545
    assert abs(american_to_implied(120) - 0.4545) < 0.001
    # -200 American = 200 / 300 = ~0.6667
    assert abs(american_to_implied(-200) - 0.6667) < 0.001
    asserts += 4

    # ── Test 10: combined implied probability multiplication ──────────────
    # 3 legs at -110 each → 0.5238^3 ≈ 0.1437
    p1 = american_to_implied(-110)
    p2 = american_to_implied(-110)
    p3 = american_to_implied(-110)
    combined = p1 * p2 * p3
    assert abs(combined - 0.1437) < 0.001, f"Expected ~0.1437, got {combined}"
    asserts += 1

    # ── Test 11: multi-line parsing (paste a 3-leg slip) ──────────────────
    block = """
LeBron James Over 25.5 PTS -110
Donovan Mitchell Under 5.5 AST -115
# This line is a comment

Anthony Davis Over 9.5 REB +120
"""
    parsed = [
        parse_pasted_line(l) for l in block.split("\n")
    ]
    legs = [p for p in parsed if p is not None]
    assert len(legs) == 3, f"Expected 3 legs, got {len(legs)}"
    assert legs[0]["rawPlayerName"] == "LeBron James"
    assert legs[1]["rawPlayerName"] == "Donovan Mitchell"
    assert legs[2]["rawPlayerName"] == "Anthony Davis"
    asserts += 4

    # ── Test 12: edge case — line value is exactly 0 ──────────────────────
    # Some props might be 0.5 lines; line=0 doesn't make sense for player
    # props but let's confirm we accept reasonable zero-or-near-zero values.
    p = parse_pasted_line("Player Name Over 0.5 AST")
    assert p is not None
    assert p["line"] == 0.5
    asserts += 2

    # ── Test 13: odds=-100 boundary case ──────────────────────────────────
    p = parse_pasted_line("Test Player Over 5.5 AST -100")
    # -100 has |100| >= 100 so it's recognized as odds
    assert p is not None
    assert p["oddsAmerican"] == -100.0
    asserts += 2

    # ── Test 14: O / U short forms recognized ─────────────────────────────
    p = parse_pasted_line("LeBron James O 25.5 PTS")
    assert p is not None
    assert p["side"] == "Over"
    p = parse_pasted_line("LeBron James U 25.5 PTS")
    assert p is not None
    assert p["side"] == "Under"
    asserts += 4

    print(f"\n  ✓ all {asserts} parlay assertions passed\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
