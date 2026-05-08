"""
Phase 19 — pipeline.simulation_test

Deterministic tests for the experimental Monte Carlo prototype. Tests
rely on `seed=` being honored — no actual randomness escapes.
"""
from __future__ import annotations

from pipeline.simulation import (
    LegInput,
    LegSimulation,
    ParlaySimulation,
    american_to_implied,
    simulate_leg,
    simulate_parlay,
    variance_pct_default,
    DEFAULT_VARIANCE_PCT,
)


def main() -> int:
    asserts = 0

    # ── Test 1: american_to_implied basic conversions ───────────────────
    assert abs(american_to_implied(-110) - 0.5238) < 0.001
    assert abs(american_to_implied(100) - 0.5) < 0.001
    assert abs(american_to_implied(150) - 0.4) < 0.001
    assert abs(american_to_implied(-200) - (200 / 300)) < 0.001
    asserts += 4

    # ── Test 2: deterministic with same seed ────────────────────────────
    leg = LegInput(
        player_name="X", market="PTS", side="Over",
        line=20.5, projection=22.0,
    )
    s1 = simulate_leg(leg, trials=2000, seed=42)
    s2 = simulate_leg(leg, trials=2000, seed=42)
    assert s1.p_over == s2.p_over, "same seed must produce identical p_over"
    assert s1.p_lean_side == s2.p_lean_side
    assert abs(s1.mean_sample - s2.mean_sample) < 1e-9
    asserts += 3

    # ── Test 3: Different seeds produce different samples ───────────────
    s_a = simulate_leg(leg, trials=2000, seed=1)
    s_b = simulate_leg(leg, trials=2000, seed=2)
    # Both should converge to similar p_over but exact match is vanishing
    assert s_a.p_over != s_b.p_over or s_a.mean_sample != s_b.mean_sample, \
        "different seeds shouldn't produce identical RNG outputs"
    asserts += 1

    # ── Test 4: when projection > line, P(over) > 0.5 ──────────────────
    bullish = LegInput(player_name="X", market="PTS", side="Over",
                        line=20.5, projection=25.0)
    s = simulate_leg(bullish, trials=5000, seed=42)
    assert s.p_over > 0.5, f"projection 25 vs line 20.5 should favor over, got p_over={s.p_over}"
    assert s.p_under < 0.5
    asserts += 2

    # ── Test 5: when projection < line, P(under) > 0.5 ─────────────────
    bearish = LegInput(player_name="X", market="PTS", side="Under",
                        line=20.5, projection=15.0)
    s = simulate_leg(bearish, trials=5000, seed=42)
    assert s.p_under > 0.5, f"projection 15 vs line 20.5 should favor under, got p_under={s.p_under}"
    assert s.p_lean_side > 0.5, "side=Under should be selected as lean side"
    asserts += 2

    # ── Test 6: when projection ≈ line, P(over) ≈ 0.5 ──────────────────
    even = LegInput(player_name="X", market="PTS", side="Over",
                     line=20.0, projection=20.0)
    s = simulate_leg(even, trials=10000, seed=42)
    assert 0.40 < s.p_over < 0.60, \
        f"projection==line should give ~0.5, got {s.p_over}"
    asserts += 1

    # ── Test 7: edge_pct calculation ────────────────────────────────────
    leg_with_odds = LegInput(
        player_name="X", market="PTS", side="Over",
        line=20.5, projection=25.0, odds_american=-110,
    )
    s = simulate_leg(leg_with_odds, trials=5000, seed=42)
    assert s.implied_prob is not None
    assert abs(s.implied_prob - 0.5238) < 0.001
    assert s.edge_pct is not None
    # bullish projection vs -110 odds should produce positive edge
    assert s.edge_pct > 0, f"expected positive edge, got {s.edge_pct}"
    asserts += 4

    # ── Test 8: no odds → no edge calculation ───────────────────────────
    leg_no_odds = LegInput(
        player_name="X", market="PTS", side="Over",
        line=20.5, projection=22.0, odds_american=None,
    )
    s = simulate_leg(leg_no_odds, trials=2000, seed=42)
    assert s.implied_prob is None
    assert s.edge_pct is None
    asserts += 2

    # ── Test 9: validation rejects bad input ────────────────────────────
    bad_cases = [
        LegInput(player_name="X", market="PTS", side="Maybe",
                 line=20.5, projection=22.0),
        LegInput(player_name="X", market="STL", side="Over",
                 line=2.5, projection=1.0),
        LegInput(player_name="X", market="PTS", side="Over",
                 line=20.5, projection=-5),
        LegInput(player_name="X", market="PTS", side="Over",
                 line=20.5, projection=22.0, variance_pct=0),
        LegInput(player_name="X", market="PTS", side="Over",
                 line=20.5, projection=22.0, variance_pct=2.0),
    ]
    for bad in bad_cases:
        try:
            simulate_leg(bad, trials=500, seed=1)
            assert False, f"expected ValueError for {bad}"
        except ValueError:
            pass
    asserts += len(bad_cases)

    # ── Test 10: trials too low rejected ────────────────────────────────
    leg = LegInput(player_name="X", market="PTS", side="Over",
                    line=20.5, projection=22.0)
    try:
        simulate_leg(leg, trials=50, seed=1)
        assert False, "expected ValueError on trials<100"
    except ValueError:
        pass
    asserts += 1

    # ── Test 11: parlay independence assumption ─────────────────────────
    legs = [
        LegInput(player_name="A", market="PTS", side="Over",
                 line=20.5, projection=22.0),
        LegInput(player_name="B", market="REB", side="Over",
                 line=8.5, projection=10.0),
    ]
    p = simulate_parlay(legs, trials=2000, seed=42)
    assert len(p.legs) == 2
    # Independence: p_all ≈ p1 × p2
    expected = p.legs[0].p_lean_side * p.legs[1].p_lean_side
    assert abs(p.p_all_hit - expected) < 0.01, \
        f"v1 assumes independence, p_all should equal product, got {p.p_all_hit} vs {expected}"
    assert p.warnings == []  # different players, only 2 legs → no warnings
    asserts += 3

    # ── Test 12: same-player parlay emits warning ───────────────────────
    same_player_legs = [
        LegInput(player_name="LeBron", market="PTS", side="Over",
                 line=25.5, projection=27.0),
        LegInput(player_name="LeBron", market="REB", side="Over",
                 line=7.5, projection=8.5),
    ]
    p = simulate_parlay(same_player_legs, trials=2000, seed=42)
    assert any("same player" in w.lower() for w in p.warnings), \
        f"expected same-player warning, got {p.warnings}"
    asserts += 1

    # ── Test 13: 4+ legs emits compounding warning ─────────────────────
    long_legs = [
        LegInput(player_name=f"P{i}", market="PTS", side="Over",
                 line=20.5, projection=22.0)
        for i in range(4)
    ]
    p = simulate_parlay(long_legs, trials=1000, seed=42)
    assert any("long parlay" in w.lower() or "compound" in w.lower()
               for w in p.warnings), f"expected long-parlay warning, got {p.warnings}"
    asserts += 1

    # ── Test 14: empty parlay rejected ──────────────────────────────────
    try:
        simulate_parlay([], trials=1000, seed=1)
        assert False, "expected ValueError on empty parlay"
    except ValueError:
        pass
    asserts += 1

    # ── Test 15: variance defaults reasonable ───────────────────────────
    assert variance_pct_default("PTS") < variance_pct_default("AST"), \
        "AST should be more volatile than PTS"
    assert variance_pct_default("REB") < variance_pct_default("AST")
    assert all(0.2 < v < 0.6 for v in DEFAULT_VARIANCE_PCT.values())
    asserts += 3

    # ── Test 16: clamps at 0 — no negative samples bias ─────────────────
    # Low-mean leg shouldn't produce negative samples; clamp ensures this.
    low_mean = LegInput(player_name="X", market="PTS", side="Over",
                         line=2.5, projection=3.0)
    s = simulate_leg(low_mean, trials=5000, seed=42)
    assert s.mean_sample >= 0, f"clamping failed, mean={s.mean_sample}"
    # Sampled mean should be slightly above projection due to clamp bias
    asserts += 1

    print(f"\n  ✓ all {asserts} simulation assertions passed\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
