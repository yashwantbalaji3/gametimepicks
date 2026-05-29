"""Tests for the NBA single-game parlay generator.

Locks the explicit "honest single-game NBA" behavior introduced in
PR `feature/nba-single-game-parlay-methodology`:

  - When the slate has exactly one NBA game AND eligible legs exist,
    the generator emits NBA-only slips marked `singleGame=True`.
  - When no NBA legs pass the eligibility gate (all No Play, all
    insufficient_data, all anomalies, etc.), zero slips.
  - Slips never duplicate a player across legs.
  - Slip leg count never exceeds the profile's `max_legs` cap.
  - All slips share one gameId (the single-game promise).
  - Conservative / Anchor profile is intentionally not supported.
  - Multi-game pools return zero — the path is opt-in for single-game
    scenarios only.
"""
from __future__ import annotations

import pytest

from pipeline.parlay_optimizer import (
    NBA_SGP_PROFILE_DEFAULTS,
    OptimizerLean,
    generate_nba_sgp_slips,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _lean(
    player_id: int,
    market: str = "PTS",
    *,
    side: str = "Over",
    line: float = 21.5,
    edge_pct: float = 10.0,
    confidence: str = "High",
    recent10: int = 10,
    star_tier: str = "core",
    is_anomaly: bool = False,
    game_id: str = "G1",
    team: str = "OKC",
    sport: str = "nba",
) -> OptimizerLean:
    return OptimizerLean(
        sport=sport,
        leanId=f"{player_id}-{market}",
        gameId=game_id,
        playerId=player_id,
        playerName=f"Player {player_id}",
        team=team,
        opponent="SAS" if team == "OKC" else "OKC",
        market=market,
        marketLabel=market,
        side=side,
        line=line,
        projection=line + 2.0,
        edgePct=edge_pct,
        confidence=confidence,
        bookmaker="fanduel",
        oddsForSide=-110,
        recent10Count=recent10,
        recentSeries=tuple([float(line + 1)] * recent10),
        recentGames=(),
        starTier=star_tier,
        isAnomaly=is_anomaly,
        isVolatileMlb=False,
        calibrationFactor=1.0,
        marketWeight=1.0,
    )


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


def test_single_game_with_eligible_legs_produces_slips():
    legs = [
        _lean(1, "PTS"),
        _lean(2, "REB"),
        _lean(3, "AST"),
        _lean(4, "PTS"),
    ]
    slips = generate_nba_sgp_slips(legs, profile="balanced", date="2026-05-28")
    assert slips, "expected at least one SGP slip"
    for s in slips:
        assert s.singleGame is True
        assert s.sameGame is True
        assert s.sport == "nba"


def test_all_slips_are_single_game_and_carry_metadata():
    legs = [_lean(i, market=("PTS", "REB", "AST")[i % 3]) for i in range(1, 11)]
    slips = generate_nba_sgp_slips(legs, profile="aggressive", date="2026-05-28")
    assert slips
    for s in slips:
        # All slips share one game (the single-game promise).
        game_ids = {leg.gameId for leg in s.legs}
        assert len(game_ids) == 1, f"slip spans multiple games: {game_ids}"
        assert s.singleGame is True
        assert s.sameGame is True
        # Honest rationale mentions higher variance / single-game.
        assert "Single-game" in s.rationale


# ---------------------------------------------------------------------------
# Guards — these MUST hold or the path becomes dishonest.
# ---------------------------------------------------------------------------


def test_no_play_legs_produce_zero_slips():
    legs = [
        _lean(1, "PTS", side="No Play"),
        _lean(2, "REB", side="No Play"),
        _lean(3, "AST", side="No Play"),
    ]
    assert generate_nba_sgp_slips(legs, profile="balanced", date="d") == []


def test_pass_side_legs_excluded():
    legs = [_lean(1, "PTS", side="Pass"), _lean(2, "REB", side="Pass")]
    assert generate_nba_sgp_slips(legs, profile="balanced", date="d") == []


def test_anomaly_legs_excluded():
    legs = [
        _lean(1, "PTS", is_anomaly=True),
        _lean(2, "REB", is_anomaly=True),
    ]
    assert generate_nba_sgp_slips(legs, profile="balanced", date="d") == []


def test_low_edge_legs_excluded():
    # All legs at 1pp edge — below the Balanced 4pp floor.
    legs = [_lean(i, ("PTS", "REB", "AST")[i % 3], edge_pct=1.0) for i in range(1, 6)]
    assert generate_nba_sgp_slips(legs, profile="balanced", date="d") == []


def test_thin_recent10_legs_excluded():
    legs = [_lean(i, ("PTS", "REB", "AST")[i % 3], recent10=3) for i in range(1, 6)]
    assert generate_nba_sgp_slips(legs, profile="balanced", date="d") == []


def test_zero_or_missing_player_id_excluded():
    legs = [_lean(0, "PTS"), _lean(0, "REB")]
    assert generate_nba_sgp_slips(legs, profile="balanced", date="d") == []


def test_no_duplicate_player_in_slip():
    # Same player on PTS + REB — both pass eligibility individually,
    # but the slip MUST NOT pair them.
    legs = [
        _lean(1, "PTS"),
        _lean(1, "REB"),
        _lean(2, "AST"),
    ]
    slips = generate_nba_sgp_slips(legs, profile="balanced", date="d")
    for s in slips:
        player_ids = [l.playerId for l in s.legs]
        assert len(player_ids) == len(set(player_ids)), f"duplicate player: {player_ids}"


def test_balanced_caps_at_2_legs():
    legs = [_lean(i, ("PTS", "REB", "AST")[i % 3]) for i in range(1, 11)]
    slips = generate_nba_sgp_slips(legs, profile="balanced", date="d")
    assert slips
    for s in slips:
        assert len(s.legs) == 2, f"balanced slip has {len(s.legs)} legs"


def test_aggressive_allows_up_to_3_legs():
    legs = [_lean(i, ("PTS", "REB", "AST")[i % 3]) for i in range(1, 12)]
    slips = generate_nba_sgp_slips(legs, profile="aggressive", date="d")
    assert slips
    leg_counts = {len(s.legs) for s in slips}
    # Aggressive should produce at least some 3-leg slips when the pool
    # supports it; 2-leg builds remain valid alternatives.
    assert leg_counts <= {2, 3}
    assert max(leg_counts) <= 3


def test_conservative_profile_returns_empty():
    # Conservative / Anchor is excluded by design — its lower-variance
    # framing would be contradicted by SGP slips.
    legs = [_lean(i, ("PTS", "REB", "AST")[i % 3]) for i in range(1, 6)]
    assert generate_nba_sgp_slips(legs, profile="conservative", date="d") == []


def test_multi_game_pool_returns_empty():
    # If the caller hands us legs from multiple games, the function
    # bails — the SGP path is opt-in for single-game scenarios only.
    legs = [
        _lean(1, "PTS", game_id="G1"),
        _lean(2, "REB", game_id="G2"),
    ]
    assert generate_nba_sgp_slips(legs, profile="balanced", date="d") == []


def test_one_eligible_leg_returns_empty():
    legs = [_lean(1, "PTS")]
    assert generate_nba_sgp_slips(legs, profile="balanced", date="d") == []


def test_star_power_requires_star_tier():
    # All "none" star-tier legs — Spotlight should reject.
    legs = [
        _lean(i, ("PTS", "REB", "AST")[i % 3], star_tier="none")
        for i in range(1, 6)
    ]
    assert generate_nba_sgp_slips(legs, profile="star_power", date="d") == []


def test_star_power_accepts_starred_legs():
    legs = [
        _lean(i, ("PTS", "REB", "AST")[i % 3], star_tier="superstar")
        for i in range(1, 6)
    ]
    slips = generate_nba_sgp_slips(legs, profile="star_power", date="d")
    assert slips


def test_num_candidates_respected():
    legs = [_lean(i, ("PTS", "REB", "AST")[i % 3]) for i in range(1, 20)]
    slips = generate_nba_sgp_slips(
        legs,
        profile="balanced",
        date="d",
        num_candidates=2,
    )
    assert len(slips) <= 2


def test_dedupe_same_player_market_across_books():
    # Two FanDuel + DraftKings rows for player 1's PTS — the dedupe
    # picks one. The final slips should still respect "no duplicate
    # player" and produce some output thanks to player 2's REB.
    legs = [
        _lean(1, "PTS", edge_pct=15.0),
        _lean(1, "PTS", edge_pct=12.0),
        _lean(2, "REB"),
    ]
    slips = generate_nba_sgp_slips(legs, profile="balanced", date="d")
    assert slips
    # Best edge wins for player 1's PTS.
    for s in slips:
        for leg in s.legs:
            if leg.playerId == 1 and leg.market == "PTS":
                assert leg.edgePct == 15.0


def test_profile_defaults_keep_aggressive_max_legs_at_3():
    # Lock the design constant — Aggressive SGP should never produce
    # 4+ leg slips even though the regular Aggressive profile allows
    # max_legs=4.
    assert NBA_SGP_PROFILE_DEFAULTS["aggressive"]["max_legs"] == 3
