"""Tests for the star registry + boost behavior in the optimizer.

Locks the contract:
  - Conservative gets the biggest star boost; Aggressive the smallest.
  - A non-star at materially higher edge still outscores a star at
    low edge — the boost is bounded, not a guarantee.
  - Boost only applies when confidence ∈ {High, Medium} so we don't
    promote unverified Low-tier signals.
  - Diacritics + suffixes normalize cleanly (Schröder, Acuna Jr.).
  - Unknown players → 0 boost, no penalty.
"""
from __future__ import annotations

import unittest

from pipeline.star_players import (
    STAR_TIER_NONE,
    STAR_TIER_CORE,
    STAR_TIER_SUPERSTAR,
    is_star,
    star_boost,
    star_tier,
)
from pipeline.parlay_optimizer import (
    BALANCED_RULES,
    CONSERVATIVE_RULES,
    AGGRESSIVE_RULES,
    leg_score,
    normalize_lean,
)


class StarRegistryTests(unittest.TestCase):

    def test_nba_superstar_detected(self):
        self.assertEqual(star_tier("Donovan Mitchell", "nba"), STAR_TIER_SUPERSTAR)
        self.assertEqual(star_tier("Jalen Brunson", "nba"), STAR_TIER_SUPERSTAR)
        self.assertTrue(is_star("Evan Mobley", "nba"))

    def test_nba_core_detected(self):
        self.assertEqual(star_tier("Josh Hart", "nba"), STAR_TIER_CORE)
        self.assertEqual(star_tier("Mikal Bridges", "nba"), STAR_TIER_CORE)

    def test_mlb_superstar_detected(self):
        self.assertEqual(star_tier("Aaron Judge", "mlb"), STAR_TIER_SUPERSTAR)
        self.assertEqual(star_tier("Mookie Betts", "mlb"), STAR_TIER_SUPERSTAR)

    def test_mlb_whitelist_core(self):
        # Players on the existing recognizable-hitters whitelist
        # default to Core tier.
        self.assertEqual(star_tier("Spencer Steer", "mlb"), STAR_TIER_CORE)
        self.assertEqual(star_tier("Keibert Ruiz", "mlb"), STAR_TIER_CORE)

    def test_unknown_player(self):
        self.assertEqual(star_tier("Some Bench Guy", "nba"), STAR_TIER_NONE)
        self.assertFalse(is_star("Some Bench Guy", "nba"))
        self.assertEqual(star_boost("Some Bench Guy", "nba", "conservative"), 0.0)

    def test_diacritic_normalization(self):
        # Schröder normalized matches Schroder.
        self.assertEqual(
            star_tier("Dennis Schröder", "nba"),
            star_tier("Dennis Schroder", "nba"),
            "Accent-stripped and accent-included names must resolve identically",
        )
        # Same for MLB.
        self.assertEqual(
            star_tier("Ronald Acuña Jr.", "mlb"),
            STAR_TIER_SUPERSTAR,
            "Diacritic-stripped name should match Ronald Acuna Jr.",
        )


class StarBoostByProfileTests(unittest.TestCase):
    """Conservative > Balanced > Aggressive — locked."""

    def test_superstar_boost_descends_by_profile(self):
        c = star_boost("Aaron Judge", "mlb", "conservative")
        b = star_boost("Aaron Judge", "mlb", "balanced")
        a = star_boost("Aaron Judge", "mlb", "aggressive")
        self.assertGreater(c, b)
        self.assertGreater(b, a)
        self.assertGreater(a, 0)

    def test_core_smaller_than_superstar(self):
        for profile in ("conservative", "balanced", "aggressive"):
            self.assertGreater(
                star_boost("Aaron Judge", "mlb", profile),
                star_boost("Spencer Steer", "mlb", profile),
            )

    def test_unknown_profile_returns_zero(self):
        self.assertEqual(star_boost("Aaron Judge", "mlb", "no_such_profile"), 0.0)


def _nba_lean(**kw) -> dict:
    base = {
        "_sport": "nba",
        "id": f"{kw.get('playerName','X')}-{kw.get('market','REB')}",
        "gameId": "g1",
        "playerId": kw.get("playerId", 100),
        "playerName": kw.get("playerName", "Bench Guy"),
        "team": kw.get("team", "OKC"),
        "opponent": "SAS",
        "market": kw.get("market", "REB"),
        "lean": "Over",
        "side": "Over",
        "line": 5.5,
        "projection": 7.0,
        "edgePct": kw.get("edgePct", 6.0),
        "confidence": kw.get("confidence", "High"),
        "oddsOver": -110,
        "oddsUnder": -110,
        "bookmaker": "draftkings",
        "recent10": [4, 5, 6, 7, 8, 5, 6, 7, 8, 9],
        "riskFlags": [],
    }
    return base


class OptimizerLegScoreWithStarBonusTests(unittest.TestCase):

    def test_star_outscores_non_star_at_equal_edge(self):
        star = normalize_lean(_nba_lean(playerName="Jalen Brunson", playerId=1, edgePct=5))
        bench = normalize_lean(_nba_lean(playerName="Bench Guy", playerId=2, edgePct=5))
        self.assertGreater(
            leg_score(star, CONSERVATIVE_RULES),
            leg_score(bench, CONSERVATIVE_RULES),
        )

    def test_bench_at_much_higher_edge_still_beats_star_at_low_edge(self):
        # The whole point of bounding the star boost. A clearly-better
        # non-star projection still wins (10pp gap is well past what
        # the boost can bridge — see _BOOST_TABLE).
        bench = normalize_lean(_nba_lean(playerName="Bench Guy", playerId=2, edgePct=18))
        star = normalize_lean(_nba_lean(playerName="Jalen Brunson", playerId=1, edgePct=3))
        self.assertGreater(
            leg_score(bench, CONSERVATIVE_RULES),
            leg_score(star, CONSERVATIVE_RULES),
        )

    def test_low_confidence_star_gets_no_boost(self):
        # Boost only applies to High / Medium. A "Low" tier star pick
        # shouldn't be promoted past a non-star High pick.
        low_star = normalize_lean(_nba_lean(playerName="Jalen Brunson", playerId=1, edgePct=5, confidence="Low"))
        # Subtract the star tier to compare apples-to-apples: build a
        # second lean without star, both Low, same edge.
        low_bench = normalize_lean(_nba_lean(playerName="Bench Guy", playerId=2, edgePct=5, confidence="Low"))
        self.assertAlmostEqual(
            leg_score(low_star, AGGRESSIVE_RULES),
            leg_score(low_bench, AGGRESSIVE_RULES),
            places=4,
            msg="Low-tier star should NOT get the boost",
        )

    def test_aggressive_boost_smaller_than_conservative(self):
        # The same star at the same edge gets a smaller boost under
        # Aggressive rules — so the high-variance lane can still
        # surface value players when the model loves them.
        star = normalize_lean(_nba_lean(playerName="Jalen Brunson", playerId=1, edgePct=5))
        bench = normalize_lean(_nba_lean(playerName="Bench Guy", playerId=2, edgePct=5))
        cons_gap = leg_score(star, CONSERVATIVE_RULES) - leg_score(bench, CONSERVATIVE_RULES)
        agg_gap = leg_score(star, AGGRESSIVE_RULES) - leg_score(bench, AGGRESSIVE_RULES)
        self.assertGreater(cons_gap, agg_gap)


if __name__ == "__main__":
    unittest.main()
