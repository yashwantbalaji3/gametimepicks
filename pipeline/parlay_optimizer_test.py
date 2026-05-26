"""Tests for the parlay optimizer.

These lock the public contract:
  - Risk-profile leg counts.
  - Confidence + edge gates.
  - Correlation suppression (same-game / same-team).
  - Volatile-MLB-market caps.
  - Player filter is honored.
  - Empty / undersized pools return zero slips (no fabrication).
"""
from __future__ import annotations

import unittest

from pipeline.parlay_optimizer import (
    AGGRESSIVE_RULES,
    BALANCED_RULES,
    CONSERVATIVE_RULES,
    OptimizerLean,
    PROFILE_RULES_BY_NAME,
    is_eligible,
    leg_score,
    normalize_lean,
    optimize,
)


def _nba_lean(**kw) -> dict:
    """Build a raw NBA-shape lean dict for tests. Sensible defaults."""
    base = {
        "_sport": "nba",
        "id": kw.pop("id", f"{kw.get('playerName', 'X')}-{kw.get('market', 'PTS')}"),
        "gameId": "g1",
        "playerId": 1001,
        "playerName": "Player One",
        "team": "OKC",
        "opponent": "SAS",
        "market": "REB",
        "lean": "Over",
        "side": "Over",
        "line": 5.5,
        "projection": 7.0,
        "edgePct": 7.5,
        "confidence": "High",
        "oddsOver": -110,
        "oddsUnder": -110,
        "bookmaker": "draftkings",
        "recent10": [4, 5, 6, 7, 8, 5, 6, 7, 8, 9],
        "riskFlags": [],
    }
    base.update(kw)
    return base


def _mlb_lean(**kw) -> dict:
    market = kw.pop("market", None) or kw.pop("marketKey", None) or "batter_hits"
    base = {
        "_sport": "mlb",
        "id": kw.pop("id", f"{kw.get('playerName', 'Y')}-{market}"),
        "gameId": "m1",
        "playerId": 2001,
        "playerName": "Hitter One",
        "playerTeamAbbr": "LAD",
        "opponentAbbr": "MIL",
        "market": market,
        "marketKey": market,
        "marketLabel": "Hits",
        "lean": "Over",
        "side": "Over",
        "line": 0.5,
        "projection": 1.2,
        "edgePct": 8.0,
        "confidence": "High",
        "oddsOver": -120,
        "oddsUnder": +110,
        "bookmaker": "fanduel",
        "recentSeries": [1, 0, 1, 1, 2, 0, 1, 1, 2, 1],
        "riskFlags": [],
    }
    base.update(kw)
    return base


class NormalizeLeanTests(unittest.TestCase):

    def test_nba_basics(self):
        leg = normalize_lean(_nba_lean())
        self.assertEqual(leg.sport, "nba")
        self.assertEqual(leg.market, "REB")
        self.assertEqual(leg.side, "Over")
        self.assertEqual(leg.recent10Count, 10)
        self.assertGreater(leg.marketWeight, 1.0, "REB should get a stability bonus")

    def test_mlb_normalization_maps_fields(self):
        leg = normalize_lean(_mlb_lean(marketKey="batter_total_bases"))
        self.assertEqual(leg.sport, "mlb")
        self.assertEqual(leg.market, "batter_total_bases")
        self.assertEqual(leg.team, "LAD")
        self.assertTrue(leg.isVolatileMlb)

    def test_anomaly_flag_propagates(self):
        leg = normalize_lean(_nba_lean(riskFlags=["suspicious_edge"]))
        self.assertTrue(leg.isAnomaly)


class LegScoreTests(unittest.TestCase):

    def test_high_confidence_outranks_medium(self):
        high = normalize_lean(_nba_lean(confidence="High", edgePct=5))
        med = normalize_lean(_nba_lean(confidence="Medium", edgePct=5))
        self.assertGreater(
            leg_score(high, BALANCED_RULES),
            leg_score(med, BALANCED_RULES),
        )

    def test_higher_edge_beats_lower(self):
        a = normalize_lean(_nba_lean(edgePct=3))
        b = normalize_lean(_nba_lean(edgePct=10))
        self.assertGreater(leg_score(b, BALANCED_RULES), leg_score(a, BALANCED_RULES))

    def test_recent10_bonus_applies(self):
        with_logs = normalize_lean(_nba_lean(recent10=[1, 2, 3, 4, 5, 6]))
        without_logs = normalize_lean(_nba_lean(recent10=[]))
        self.assertGreater(
            leg_score(with_logs, BALANCED_RULES),
            leg_score(without_logs, BALANCED_RULES),
        )

    def test_market_weight_factors_in(self):
        # REB outranks AST for the same edge + confidence.
        reb = normalize_lean(_nba_lean(market="REB"))
        ast = normalize_lean(_nba_lean(market="AST"))
        self.assertGreater(
            leg_score(reb, BALANCED_RULES),
            leg_score(ast, BALANCED_RULES),
        )


class EligibilityTests(unittest.TestCase):

    def test_pass_lean_excluded(self):
        leg = normalize_lean(_nba_lean(lean="No Play", side="Pass"))
        self.assertFalse(is_eligible(leg, BALANCED_RULES))

    def test_low_edge_rejected_by_conservative(self):
        leg = normalize_lean(_nba_lean(edgePct=2.0))
        self.assertFalse(is_eligible(leg, CONSERVATIVE_RULES))

    def test_medium_rejected_by_conservative(self):
        leg = normalize_lean(_nba_lean(confidence="Medium"))
        self.assertFalse(is_eligible(leg, CONSERVATIVE_RULES))

    def test_anomaly_excluded_by_balanced(self):
        leg = normalize_lean(_nba_lean(riskFlags=["suspicious_edge"]))
        self.assertFalse(is_eligible(leg, BALANCED_RULES))

    def test_aggressive_admits_anomaly(self):
        leg = normalize_lean(_nba_lean(riskFlags=["suspicious_edge"], confidence="Low", edgePct=1.5))
        self.assertTrue(is_eligible(leg, AGGRESSIVE_RULES))

    def test_conservative_blocks_volatile_mlb(self):
        leg = normalize_lean(_mlb_lean(marketKey="pitcher_strikeouts"))
        self.assertFalse(is_eligible(leg, CONSERVATIVE_RULES))

    def test_player_filter_honored(self):
        a = normalize_lean(_nba_lean(playerName="Alex Bregman"))
        b = normalize_lean(_nba_lean(playerName="Other Guy"))
        self.assertTrue(is_eligible(a, BALANCED_RULES, selected_player_names={"alex_bregman"}))
        self.assertFalse(is_eligible(b, BALANCED_RULES, selected_player_names={"alex_bregman"}))

    def test_game_filter_honored(self):
        leg = normalize_lean(_nba_lean(gameId="g7"))
        self.assertTrue(is_eligible(leg, BALANCED_RULES, selected_game_ids={"g7"}))
        self.assertFalse(is_eligible(leg, BALANCED_RULES, selected_game_ids={"g8"}))


class OptimizerSlipBuildTests(unittest.TestCase):

    def test_conservative_emits_two_legs_high_confidence_only(self):
        raw = [
            _nba_lean(id="a", playerName="A", playerId=1, gameId="g1", team="T1"),
            _nba_lean(id="b", playerName="B", playerId=2, gameId="g2", team="T2"),
            _nba_lean(id="c", playerName="C", playerId=3, gameId="g3", team="T3", confidence="Medium"),
        ]
        slips = optimize(raw, profile="conservative")
        self.assertTrue(slips, "conservative should produce at least one slip")
        for s in slips:
            self.assertEqual(s.profile, "conservative")
            self.assertEqual(len(s.legs), 2)
            for leg in s.legs:
                self.assertEqual(leg.confidence, "High")

    def test_balanced_three_legs(self):
        raw = [
            _nba_lean(id=f"l{i}", playerName=f"P{i}", playerId=i, gameId=f"g{i}", team=f"T{i}")
            for i in range(1, 6)
        ]
        slips = optimize(raw, profile="balanced")
        self.assertTrue(slips)
        for s in slips:
            self.assertEqual(len(s.legs), 3)

    def test_aggressive_four_or_five_legs(self):
        raw = [
            _nba_lean(id=f"l{i}", playerName=f"P{i}", playerId=i, gameId=f"g{i % 3}", team=f"T{i % 4}", edgePct=2)
            for i in range(1, 8)
        ]
        slips = optimize(raw, profile="aggressive")
        self.assertTrue(slips)
        for s in slips:
            self.assertGreaterEqual(len(s.legs), 4)
            self.assertLessEqual(len(s.legs), 5)

    def test_same_game_cap_enforced(self):
        # Conservative caps at 1 leg per game; if all three eligible
        # leans share a gameId, only one can land in the slip and the
        # slip should fail to assemble (min_legs=2).
        raw = [
            _nba_lean(id=f"l{i}", playerName=f"P{i}", playerId=i, gameId="g1", team=f"T{i}")
            for i in range(1, 4)
        ]
        slips = optimize(raw, profile="conservative")
        self.assertEqual(slips, [], "single-game pool can't produce a conservative slip")

    def test_same_team_cap_enforced(self):
        # Conservative caps at 1 leg per team. Three legs same team → 0 slips.
        raw = [
            _nba_lean(id=f"l{i}", playerName=f"P{i}", playerId=i, gameId=f"g{i}", team="OKC")
            for i in range(1, 4)
        ]
        slips = optimize(raw, profile="conservative")
        self.assertEqual(slips, [])

    def test_volatile_market_cap_balanced(self):
        # Balanced allows at most 1 volatile MLB market.
        raw = [
            _mlb_lean(id=f"a{i}", playerName=f"P{i}", playerId=10 + i, gameId=f"m{i}",
                      playerTeamAbbr=f"T{i}",
                      marketKey="pitcher_strikeouts", market="pitcher_strikeouts",
                      edgePct=5)
            for i in range(5)
        ]
        # Even though there are 5 candidates, only one volatile leg
        # may appear — Balanced needs 3 legs, so no slip is built.
        slips = optimize(raw, profile="balanced")
        self.assertEqual(slips, [])

    def test_player_filter_restricts_pool(self):
        raw = [
            _nba_lean(id="a", playerName="Alex Bregman", playerId=1, gameId="g1", team="T1"),
            _nba_lean(id="b", playerName="Other", playerId=2, gameId="g2", team="T2"),
            _nba_lean(id="c", playerName="Third", playerId=3, gameId="g3", team="T3"),
        ]
        slips = optimize(raw, profile="conservative", player_names=["Alex Bregman"])
        # Only one player in the filtered pool → can't reach min_legs=2.
        self.assertEqual(slips, [])

    def test_no_fake_output_when_empty(self):
        slips = optimize([], profile="conservative")
        self.assertEqual(slips, [])

    def test_no_fake_output_when_undersized(self):
        # Aggressive requires min_legs=4 but pool has 2 eligible.
        raw = [
            _nba_lean(id="a", playerName="A", playerId=1, gameId="g1", team="T1"),
            _nba_lean(id="b", playerName="B", playerId=2, gameId="g2", team="T2"),
        ]
        slips = optimize(raw, profile="aggressive")
        self.assertEqual(slips, [])

    def test_score_orders_high_above_low_confidence(self):
        # Build two aggressive pools — one all-High, one all-Low —
        # and confirm the all-High slip outscores the all-Low one.
        high_raw = [
            _nba_lean(id=f"h{i}", playerName=f"H{i}", playerId=100 + i,
                      gameId=f"g{i}", team=f"T{i}", confidence="High", edgePct=4)
            for i in range(4)
        ]
        low_raw = [
            _nba_lean(id=f"l{i}", playerName=f"L{i}", playerId=200 + i,
                      gameId=f"g{i}", team=f"T{i}", confidence="Low", edgePct=4)
            for i in range(4)
        ]
        hi_slips = optimize(high_raw, profile="aggressive")
        lo_slips = optimize(low_raw, profile="aggressive")
        self.assertTrue(hi_slips and lo_slips)
        self.assertGreater(hi_slips[0].score, lo_slips[0].score)

    def test_correlation_penalty_reduces_same_game_slip(self):
        # Aggressive allows up to 3 legs per game. Two pools of 4 legs
        # each; in one all four share a game, in the other they don't.
        same_game = [
            _nba_lean(id=f"a{i}", playerName=f"A{i}", playerId=300 + i,
                      gameId="shared", team=f"T{i}", edgePct=4)
            for i in range(4)
        ]
        diff_games = [
            _nba_lean(id=f"b{i}", playerName=f"B{i}", playerId=400 + i,
                      gameId=f"g{i}", team=f"T{i}", edgePct=4)
            for i in range(4)
        ]
        # Aggressive max_legs_per_game=3, max_legs_per_team=3, so
        # same_game pool will fit only 3 legs and may not satisfy
        # min_legs=4. Confirm the diff-games slip beats the same-game
        # slip OR same-game slip doesn't build at all (both are
        # honest outcomes — never an unsuppressed same-game stack).
        sg_slips = optimize(same_game, profile="aggressive")
        dg_slips = optimize(diff_games, profile="aggressive")
        self.assertTrue(dg_slips)
        if sg_slips:
            self.assertGreater(dg_slips[0].score, sg_slips[0].score)

    def test_aggressive_caps_anomaly_legs(self):
        raw = [
            _nba_lean(id=f"l{i}", playerName=f"P{i}", playerId=i,
                      gameId=f"g{i}", team=f"T{i}",
                      riskFlags=["suspicious_edge"], edgePct=2)
            for i in range(1, 6)
        ]
        slips = optimize(raw, profile="aggressive")
        for s in slips:
            anomalies = sum(1 for leg in s.legs if leg.isAnomaly)
            self.assertLessEqual(
                anomalies,
                AGGRESSIVE_RULES.max_anomaly_legs,
                "aggressive should cap anomaly legs at 1",
            )


class AuditDrivenWeightTests(unittest.TestCase):
    """Locks the 2026-05-25 audit-driven re-weighting:
      - NBA REB outscores NBA AST by a wider margin than before.
      - MLB pitcher_strikeouts is excluded from Balanced.
      - MLB High tier is flattened to roughly Medium-level weight.
    """

    def test_nba_reb_outscores_ast_by_wider_margin(self):
        # Same High confidence + same edge — only the market differs.
        reb = normalize_lean(_nba_lean(market="REB", confidence="High", edgePct=5))
        ast = normalize_lean(_nba_lean(market="AST", confidence="High", edgePct=5))
        reb_score = leg_score(reb, BALANCED_RULES)
        ast_score = leg_score(ast, BALANCED_RULES)
        self.assertGreater(reb_score, ast_score)
        # The market weights (REB 1.15, AST 0.80) → the ratio should
        # be at least 1.30 (1.15/0.80 ≈ 1.44). Pin a lower bound that
        # makes the audit motivation visible in failure messages.
        self.assertGreater(reb_score / ast_score, 1.30)

    def test_balanced_blocks_pitcher_strikeouts(self):
        leg = normalize_lean(_mlb_lean(market="pitcher_strikeouts", confidence="High", edgePct=8))
        self.assertFalse(is_eligible(leg, BALANCED_RULES))
        # Aggressive still allows strikeouts.
        self.assertTrue(is_eligible(leg, AGGRESSIVE_RULES))

    def test_mlb_high_tier_flattened_to_roughly_medium(self):
        # An MLB High leg and an MLB Medium leg with the same edge
        # should now score WITHIN 10% of each other (the audit-driven
        # tier adjustment knocks High down to Medium's level).
        # Same hits market on both, so the market weight is constant.
        high = normalize_lean(_mlb_lean(market="batter_hits", confidence="High", edgePct=5))
        med = normalize_lean(_mlb_lean(market="batter_hits", confidence="Medium", edgePct=5))
        h_score = leg_score(high, BALANCED_RULES)
        m_score = leg_score(med, BALANCED_RULES)
        # High still beats Medium by a hair (because the base weight
        # 1.0 × 0.65 = 0.65 vs Medium's 0.65 × 1.0 = 0.65 is exactly
        # equal — plus the edge term is identical). They should be
        # roughly tied.
        self.assertAlmostEqual(h_score, m_score, places=4)

    def test_nba_high_tier_NOT_flattened(self):
        # NBA tier weights are untouched — the audit doesn't show
        # NBA High as inverted, just that Medium happens to outperform.
        high = normalize_lean(_nba_lean(market="REB", confidence="High", edgePct=5))
        med = normalize_lean(_nba_lean(market="REB", confidence="Medium", edgePct=5))
        self.assertGreater(leg_score(high, BALANCED_RULES), leg_score(med, BALANCED_RULES))


class PlayerInjectionTests(unittest.TestCase):
    """Sanity that must_include_player_names biases ordering but never
    forces an ineligible leg in."""

    def test_must_include_pulls_player_forward(self):
        raw = [
            _nba_lean(id="other", playerName="Other Star", playerId=1, gameId="g1",
                      team="T1", edgePct=10),
            _nba_lean(id="want", playerName="Alex Bregman", playerId=2, gameId="g2",
                      team="T2", edgePct=4),
            _nba_lean(id="filler", playerName="Filler", playerId=3, gameId="g3",
                      team="T3", edgePct=5),
        ]
        slips = optimize(raw, profile="balanced",
                          must_include_player_names=["Alex Bregman"])
        self.assertTrue(slips)
        names = [l.playerName for l in slips[0].legs]
        self.assertIn("Alex Bregman", names)


class DiversitySelectorTests(unittest.TestCase):
    """Locks the final-selection pass (PR #100):
      - Multiple distinct star players surface across visible slips
        when alternatives exist.
      - Same player isn't repeated across every visible slip just
        because they have the highest raw score.
      - If no alternatives exist (single eligible MLB star), the
        repeat is allowed — diversity is a tiebreaker, not censorship.
      - Conservative diversifies more aggressively than Aggressive.
    """

    def _make_lean(self, **kw) -> dict:
        base = {
            "_sport": "nba",
            "id": f"{kw.get('playerName','x')}-{kw.get('market','REB')}",
            "gameId": kw.get("gameId", "g1"),
            "playerId": kw.get("playerId", 1),
            "playerName": kw.get("playerName", "Player"),
            "team": kw.get("team", "OKC"),
            "opponent": "SAS",
            "market": "REB",
            "lean": "Over",
            "side": "Over",
            "line": 5.5,
            "projection": 7.0,
            "edgePct": kw.get("edgePct", 6),
            "confidence": "High",
            "oddsOver": -110,
            "oddsUnder": -110,
            "bookmaker": "draftkings",
            "recent10": [4, 5, 6, 7, 8, 5, 6, 7, 8, 9],
            "riskFlags": [],
        }
        return base

    def test_visible_balanced_diversifies_when_alternates_exist(self):
        # Pool: 3 distinct game-pairs with 2 NBA stars each game so
        # balanced can build 3-leg slips with different player sets.
        raw = []
        # Game 1
        raw.append(self._make_lean(playerName="Donovan Mitchell", playerId=11, gameId="g1", team="CLE", edgePct=8))
        raw.append(self._make_lean(playerName="Evan Mobley", playerId=12, gameId="g1", team="CLE", edgePct=10))
        # Game 2
        raw.append(self._make_lean(playerName="Jalen Brunson", playerId=21, gameId="g2", team="NY", edgePct=8))
        raw.append(self._make_lean(playerName="Karl-Anthony Towns", playerId=22, gameId="g2", team="NY", edgePct=10))
        # Game 3
        raw.append(self._make_lean(playerName="Aaron Judge", playerId=31, gameId="g3", team="NYY", edgePct=12,
                                   playerName_fix=None))
        raw[-1]["_sport"] = "mlb"
        raw[-1]["market"] = "batter_hits"
        raw[-1]["line"] = 0.5
        raw.append(self._make_lean(playerName="Mookie Betts", playerId=32, gameId="g4", team="LAD", edgePct=11))
        raw[-1]["_sport"] = "mlb"
        raw[-1]["market"] = "batter_hits"
        raw[-1]["line"] = 0.5
        slips = optimize(raw, profile="balanced", num_candidates=3)
        # We should see at least 4 distinct player names across the 3
        # visible balanced slips — proof the selector is varying picks.
        names = []
        for s in slips:
            for leg in s.legs:
                names.append(leg.playerName)
        self.assertGreaterEqual(len(set(names)), 4,
                                f"Balanced visible slips repeat too much: {names}")

    def test_same_player_can_repeat_when_no_alternatives(self):
        # Only 3 eligible players across 3 games → no diversity is
        # possible for a 3-leg balanced slip. Same player is allowed
        # to repeat across slips. The selector returns ≥1 slip and
        # never invents an alternative.
        raw = []
        for i in range(1, 4):
            raw.append(self._make_lean(playerName=f"P{i}", playerId=i, gameId=f"g{i}", team=f"T{i}", edgePct=8))
        slips = optimize(raw, profile="balanced", num_candidates=5)
        # We get the one possible slip; the selector doesn't fabricate.
        self.assertGreaterEqual(len(slips), 1)
        # Every slip has the same 3 players (since that's all we have).
        for s in slips:
            self.assertEqual(len(s.legs), 3)

    def test_diversity_does_not_pick_low_quality_junk(self):
        # Two strong star slips and one obviously bad low-edge slip.
        # Diversity must NOT promote the junk slip over a repeat
        # superstar slip — quality dominates.
        raw = []
        raw.append(self._make_lean(playerName="Jalen Brunson", playerId=1, gameId="g1", team="NY", edgePct=14))
        raw.append(self._make_lean(playerName="Donovan Mitchell", playerId=2, gameId="g2", team="CLE", edgePct=13))
        raw.append(self._make_lean(playerName="Evan Mobley", playerId=3, gameId="g3", team="CLE", edgePct=12))
        # Junk: barely-eligible low-edge non-star
        raw.append(self._make_lean(playerName="Bench Guy", playerId=4, gameId="g4", team="ZZZ", edgePct=2.5))
        slips = optimize(raw, profile="conservative", num_candidates=2)
        # Top slip should be Brunson + Mitchell (highest combined). Junk
        # shouldn't make a top-2 visible slip.
        for s in slips:
            for leg in s.legs:
                self.assertNotEqual(leg.playerName, "Bench Guy",
                                    "Diversity must not promote low-edge junk into top visible slips")


class StarPowerLaneTests(unittest.TestCase):
    """Locks the Star Power lane contract (PR #101):
      - Strict-star eligibility — non-stars are filtered out.
      - Low-confidence stars are rejected (lane requires High/Medium).
      - AST/PTS market override fires only for superstar/core stars on
        High/Medium confidence inside Star Power; does NOT leak into
        Conservative/Balanced/Aggressive scoring.
      - Same-game cap=2 lets a 1-NBA-game slate produce a NBA stack.
      - Lane returns empty when no eligible stars exist (no fabrication).
    """

    def test_star_power_strict_excludes_non_stars(self):
        # Two strong High-conf NBA legs from a non-star + two real
        # stars. Star Power should never pick the non-star.
        raw = [
            _nba_lean(playerName="Bench Guy", playerId=9001, edgePct=18,
                      market="REB", line=5.5),
            _nba_lean(playerName="Evan Mobley", playerId=9002,
                      gameId="g_cle_ny", team="CLE", edgePct=14,
                      market="REB", line=8.5),
            _nba_lean(playerName="Jalen Brunson", playerId=9003,
                      gameId="g_cle_ny", team="NY", edgePct=18,
                      market="AST", line=6.5),
        ]
        slips = optimize(raw, profile="star_power", num_candidates=4)
        for s in slips:
            for leg in s.legs:
                self.assertNotEqual(
                    leg.playerName, "Bench Guy",
                    "Star Power must not include non-stars when stars exist",
                )

    def test_star_power_rejects_low_confidence_stars(self):
        # The lane's confidence gate is ("High", "Medium"). A Low-conf
        # star should not enter Star Power even if its edge is huge.
        raw = [
            _mlb_lean(playerName="Corbin Carroll", playerId=8001,
                      edgePct=27, confidence="Low"),
            _mlb_lean(playerName="Pete Alonso", playerId=8002,
                      gameId="m2", team="NYM", edgePct=13,
                      confidence="High"),
            _mlb_lean(playerName="Mookie Betts", playerId=8003,
                      gameId="m3", team="LAD", edgePct=12,
                      confidence="High"),
        ]
        slips = optimize(raw, profile="star_power", num_candidates=2)
        for s in slips:
            for leg in s.legs:
                self.assertNotEqual(
                    leg.playerName, "Corbin Carroll",
                    "Low-conf star must not enter Star Power",
                )

    def test_star_power_ast_override_only_in_star_power(self):
        # Brunson AST +18 High superstar should score HIGHER in Star
        # Power than in Conservative because Star Power restores
        # nba:AST market weight (0.80 -> 1.00) for superstar/core
        # High/Medium leans only.
        raw = _nba_lean(
            playerName="Jalen Brunson", playerId=7777,
            market="AST", line=6.5, edgePct=18, confidence="High",
            team="NY", gameId="g_cle_ny",
        )
        lean = normalize_lean(raw, sport="nba")
        cons_score = leg_score(lean, PROFILE_RULES_BY_NAME["conservative"])
        sp_score = leg_score(lean, PROFILE_RULES_BY_NAME["star_power"])
        self.assertGreater(
            sp_score, cons_score,
            f"Star Power should beat Conservative on AST superstar "
            f"(cons={cons_score:.3f} sp={sp_score:.3f})",
        )
        # And the override must NOT affect Conservative — a regression
        # would silently restore AST weight for everyone.
        cons_rules = PROFILE_RULES_BY_NAME["conservative"]
        from pipeline.parlay_optimizer import MARKET_STABILITY_WEIGHT
        expected_market_weight = MARKET_STABILITY_WEIGHT["nba:AST"]
        self.assertAlmostEqual(expected_market_weight, 0.80, places=3,
                               msg="Global AST weight must stay 0.80")

    def test_star_power_ast_override_does_not_fire_for_low_conf(self):
        # A Low-conf superstar AST leg should NOT get the override
        # (it only fires for High/Medium). The whole lane's confidence
        # gate also rejects Low — this just guards the override clause
        # independently of the gate.
        from pipeline.parlay_optimizer import leg_score_breakdown
        raw = _nba_lean(
            playerName="Jalen Brunson", playerId=7777,
            market="AST", line=6.5, edgePct=18, confidence="Low",
            team="NY", gameId="g_cle_ny",
        )
        lean = normalize_lean(raw, sport="nba")
        breakdown = leg_score_breakdown(lean, PROFILE_RULES_BY_NAME["star_power"])
        self.assertAlmostEqual(
            float(breakdown["marketWeight"]), 0.80, places=3,
            msg="AST override must NOT fire for Low confidence",
        )

    def test_star_power_refuses_nba_same_game_stacks(self):
        # PR #110 safety filter: same-game NBA stacks went 1W-23L
        # (4.2%) on 5/25. The Star Power lane's max_legs_per_game
        # was tightened from 2 to 1, so a 1-NBA-game slate must NOT
        # produce a 2-leg NBA-only Star Power slip. The lane returns
        # empty for NBA-only on a single-game slate; cross-sport
        # multi slips remain viable.
        raw = [
            _nba_lean(playerName="Evan Mobley", playerId=6001,
                      gameId="g_cle_ny", team="CLE", market="REB",
                      line=8.5, edgePct=14, confidence="High"),
            _nba_lean(playerName="Jalen Brunson", playerId=6002,
                      gameId="g_cle_ny", team="NY", market="AST",
                      line=6.5, edgePct=18, confidence="High"),
        ]
        slips = optimize(raw, profile="star_power", sport="nba",
                         num_candidates=2)
        # No 2-leg NBA-only slip should build: the cap blocks legs from
        # the same gameId.
        for s in slips:
            game_ids = {l.gameId for l in s.legs}
            self.assertEqual(
                len(game_ids), len(s.legs),
                "Star Power must NOT stack multiple legs from the same NBA game"
            )

    def test_star_power_returns_empty_when_no_star_candidates(self):
        # A pool with strong leans from non-stars only must produce
        # zero Star Power slips. No fabrication, no fallback into
        # non-star territory.
        raw = [
            _nba_lean(playerName=f"Bench {i}", playerId=5000 + i,
                      gameId=f"g{i}", team=f"T{i}",
                      edgePct=15, confidence="High")
            for i in range(5)
        ]
        slips = optimize(raw, profile="star_power", num_candidates=4)
        self.assertEqual(
            slips, [],
            "Star Power must be empty when no star candidates exist",
        )


class LegScoreBreakdownTests(unittest.TestCase):
    """Locks the per-leg scoring breakdown used by the custom-parlay
    builder. The breakdown must equal the components that compose
    `leg_score` so the client can reproduce the optimizer's view of
    each leg without duplicating any formula."""

    def test_breakdown_components_sum_to_leg_score(self):
        from pipeline.parlay_optimizer import leg_score_breakdown
        raw = _nba_lean(
            playerName="Evan Mobley", playerId=4001,
            market="REB", line=8.5, edgePct=14, confidence="High",
        )
        lean = normalize_lean(raw, sport="nba")
        rules = PROFILE_RULES_BY_NAME["balanced"]
        bd = leg_score_breakdown(lean, rules)
        # Sum the additive components then × marketWeight × calibration.
        additive = (
            float(bd["confidenceComponent"])
            + float(bd["edgeComponent"])
            + float(bd["recent10Bonus"])
            + float(bd["pidBonus"])
            + float(bd["starBoost"])
        )
        reconstructed = additive * float(bd["marketWeight"]) * float(bd["calibrationFactor"])
        self.assertAlmostEqual(
            reconstructed, float(bd["legScore"]), places=3,
            msg=f"Breakdown components must reconstruct legScore "
                f"(got {reconstructed:.3f} vs {bd['legScore']:.3f})",
        )

    def test_breakdown_includes_star_boost_for_star_in_high_medium(self):
        from pipeline.parlay_optimizer import leg_score_breakdown
        raw = _nba_lean(
            playerName="Jalen Brunson", playerId=4002,
            market="PTS", line=27.5, edgePct=12, confidence="High",
        )
        lean = normalize_lean(raw, sport="nba")
        bd = leg_score_breakdown(lean, PROFILE_RULES_BY_NAME["balanced"])
        self.assertGreater(
            float(bd["starBoost"]), 0,
            "Brunson superstar should get a positive star boost",
        )


class SafetyFiltersTests(unittest.TestCase):
    """Locks the PR #110 safety filters after the 5/25 audit (6W-54L
    overall · 10.0% decisive hit rate · 5-leg 0/14 · same-game NBA
    1/24 · AST market 0/5).
    """

    def test_aggressive_max_legs_capped_at_4(self):
        # PR #110: 5-leg aggressive slips went 0/14. Aggressive lane
        # now caps at 4 visible legs.
        self.assertEqual(
            AGGRESSIVE_RULES.max_legs, 4,
            "Aggressive lane must cap visible slips at 4 legs after the "
            "5/25 audit where 5-leg slips went 0W-14L",
        )

    def test_star_power_same_game_cap_is_1(self):
        # PR #110: same-game NBA Star Power stacks went 1W-23L.
        from pipeline.parlay_optimizer import STAR_POWER_RULES
        self.assertEqual(
            STAR_POWER_RULES.max_legs_per_game, 1,
            "Star Power must cap same-game stacks at 1 leg until pregame "
            "spread context is wired in",
        )

    def test_leg_score_edge_clipped_at_15pp(self):
        # PR #110: edge clip 20→15. A leg with 15pp edge should
        # produce the same score as a leg with 20pp edge — both
        # saturate at the new ceiling.
        from pipeline.parlay_optimizer import leg_score
        rules = PROFILE_RULES_BY_NAME["balanced"]
        # Use a high-edge non-star (e.g. Dean Wade) — anyone whose
        # leg_score is dominated by edge contribution.
        l15 = normalize_lean(_nba_lean(
            playerName="High Edge Guy A", playerId=11111,
            market="REB", line=2.5, edgePct=15.0, confidence="High",
        ), sport="nba")
        l20 = normalize_lean(_nba_lean(
            playerName="High Edge Guy B", playerId=11112,
            market="REB", line=2.5, edgePct=20.0, confidence="High",
        ), sport="nba")
        # Same player attributes, only edge differs. With the new clip
        # both should produce identical scores (both saturate the
        # 15pp ceiling).
        self.assertAlmostEqual(
            leg_score(l15, rules), leg_score(l20, rules), places=4,
            msg="Edge > 15pp must saturate; 15pp and 20pp must score equally",
        )

    def test_star_power_ast_override_requires_recent10(self):
        # PR #110: AST went 0W-5L on 5/25. The Star Power AST/PTS
        # market override now also requires recent10Count >= 7.
        # Without recent10 support, a superstar AST leg gets the
        # default 0.80 market weight (not the 1.00 override).
        from pipeline.parlay_optimizer import leg_score_breakdown
        sp_rules = PROFILE_RULES_BY_NAME["star_power"]
        # Brunson AST + only 4 recent games — under the new floor
        raw_thin = _nba_lean(
            playerName="Jalen Brunson", playerId=7777,
            market="AST", line=6.5, edgePct=10, confidence="High",
            team="NY", gameId="g_cle_ny",
        )
        raw_thin["recent10"] = [4, 6, 5, 7]  # only 4 values
        thin = normalize_lean(raw_thin, sport="nba")
        bd_thin = leg_score_breakdown(thin, sp_rules)
        self.assertAlmostEqual(
            float(bd_thin["marketWeight"]), 0.80, places=3,
            msg="Override must NOT fire when recent10Count < 7",
        )
        # Brunson AST + 8 recent games — clears the floor
        raw_full = _nba_lean(
            playerName="Jalen Brunson", playerId=7778,
            market="AST", line=6.5, edgePct=10, confidence="High",
            team="NY", gameId="g_cle_ny",
        )
        raw_full["recent10"] = [4, 6, 5, 7, 8, 6, 5, 9]  # 8 values
        full = normalize_lean(raw_full, sport="nba")
        bd_full = leg_score_breakdown(full, sp_rules)
        self.assertAlmostEqual(
            float(bd_full["marketWeight"]), 1.00, places=3,
            msg="Override must fire when recent10Count >= 7",
        )


if __name__ == "__main__":
    unittest.main()
