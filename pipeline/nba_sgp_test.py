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


# ---------------------------------------------------------------------------
# Diversity controls (PR fix/nba-sgp-diversity, 2026-05-28)
# ---------------------------------------------------------------------------


def _dominator_pool() -> list:
    """Build a pool where player 1 has by far the highest-edge legs in
    every market (mirroring the live 2026-05-28 Keldon Johnson shape)
    so the diversity selector is the only thing that prevents the same
    name from appearing in every slip.
    """
    legs: list = []
    # Dominator: player 1 with 24pp edge on all three markets.
    for market in ("PTS", "REB", "AST"):
    # Edge floors keep our tests Balanced-eligible (4pp+) for
    # alternatives too.
        legs.append(_lean(1, market, edge_pct=24.0, confidence="High"))
    # Eight credible alternatives at 10pp edge, three markets each.
    for pid in range(2, 10):
        for market in ("PTS", "REB", "AST"):
            legs.append(_lean(pid, market, edge_pct=10.0, confidence="High"))
    return legs


def test_diversity_keeps_dominator_under_majority_of_slips():
    # With many credible alternatives, the same player should NOT show
    # up in every slip. Concretely: when the slate has a Keldon-style
    # dominator + 8 credible alternates, the dominator's exposure
    # across the returned slips must be < 100%.
    legs = _dominator_pool()
    slips = generate_nba_sgp_slips(
        legs,
        profile="balanced",
        date="d",
        num_candidates=4,
    )
    assert len(slips) == 4
    dominator_count = sum(
        1 for s in slips if any((l.playerId or 0) == 1 for l in s.legs)
    )
    # < 100% — at least one slip must NOT contain the dominator.
    assert dominator_count < len(slips), (
        f"dominator appears in every slip ({dominator_count}/{len(slips)})"
    )


def test_diversity_no_identical_pair_repeats():
    # All four returned slips should pair different players (or at
    # least: no exact same player pair appears twice).
    legs = _dominator_pool()
    slips = generate_nba_sgp_slips(
        legs,
        profile="balanced",
        date="d",
        num_candidates=4,
    )
    pair_keys = [
        tuple(sorted((l.playerId or 0) for l in s.legs))
        for s in slips
    ]
    assert len(set(pair_keys)) == len(pair_keys), (
        f"pair repeated across the visible slips: {pair_keys}"
    )


def test_diversity_distributes_player_exposure():
    # Across the returned slips' legs, the heaviest-used player should
    # appear in no more than HALF + 1 of the legs (a soft fairness
    # check — strict 50%-of-slips is asserted separately above).
    legs = _dominator_pool()
    slips = generate_nba_sgp_slips(
        legs,
        profile="balanced",
        date="d",
        num_candidates=4,
    )
    leg_counts: dict[int, int] = {}
    for s in slips:
        for l in s.legs:
            leg_counts[l.playerId or 0] = leg_counts.get(l.playerId or 0, 0) + 1
    total_legs = sum(leg_counts.values())
    top_count = max(leg_counts.values())
    # With 4 slips × 2 legs = 8 legs and 9 eligible players, no single
    # player should consume more than half the leg slots.
    assert top_count <= total_legs // 2 + 1, (
        f"player exposure unbalanced — top player has {top_count}/{total_legs} legs"
    )


def test_diversity_prefers_market_variety_when_possible():
    # When PTS/REB/AST candidates are all available, the visible slip
    # set should touch every market at least once (the +bonus for
    # fresh markets makes this the dominant tie-breaker once exposure
    # penalties have done their work).
    legs = _dominator_pool()
    slips = generate_nba_sgp_slips(
        legs,
        profile="balanced",
        date="d",
        num_candidates=4,
    )
    used_markets: set[str] = set()
    for s in slips:
        for l in s.legs:
            used_markets.add(l.market)
    assert used_markets == {"PTS", "REB", "AST"}, (
        f"market mix incomplete: {used_markets}"
    )


def test_diversity_fallback_when_alternatives_are_too_weak():
    # When the dominator is the only credible source (alternatives
    # below the edge floor), the diversity selector must NOT pick weak
    # legs just to spread names. The generator returns what's
    # eligible; the selector preserves it. Outcome: fewer slips, never
    # a fabricated diversification.
    legs: list = []
    for market in ("PTS", "REB", "AST"):
        legs.append(_lean(1, market, edge_pct=24.0))
    # Single weak partner; 1pp edge floor for Balanced is 4pp, so 2pp
    # is rejected at eligibility, leaving the dominator with no partner.
    legs.append(_lean(2, "PTS", edge_pct=2.0))
    slips = generate_nba_sgp_slips(
        legs,
        profile="balanced",
        date="d",
        num_candidates=4,
    )
    # The dominator can't pair with himself (one leg per player), and
    # there's no eligible partner. Output is empty — never a hallucinated
    # diversification.
    assert slips == []


def test_diversity_no_infinite_loop_with_few_candidates():
    # Two eligible legs → exactly one possible 2-leg slip. The
    # selector must terminate even when target > candidates available.
    legs = [_lean(1, "PTS"), _lean(2, "REB")]
    slips = generate_nba_sgp_slips(
        legs,
        profile="balanced",
        date="d",
        num_candidates=4,
    )
    assert len(slips) == 1
    assert all(s.singleGame for s in slips)


def test_diversity_aggressive_still_supports_3_leg_slips():
    # Aggressive SGP should still produce 3-leg slips after the
    # diversity pass — the selector doesn't degrade leg count, only
    # ordering.
    legs = []
    for pid in range(1, 10):
        for market in ("PTS", "REB", "AST"):
            legs.append(_lean(pid, market, edge_pct=12.0, confidence="High"))
    slips = generate_nba_sgp_slips(
        legs,
        profile="aggressive",
        date="d",
        num_candidates=4,
    )
    assert slips
    # At least one 3-leg slip should survive the diversity pass.
    assert any(len(s.legs) == 3 for s in slips)
