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

import pipeline.parlay_optimizer as po
from pipeline.parlay_optimizer import (
    _sgp_leg_quality,
    _market_reliability_delta,
    _recent_form_quality_delta,
    AGGRESSIVE_RULES,
    BALANCED_RULES,
    CONSERVATIVE_RULES,
    OptimizerLean,
    PROFILE_RULES_BY_NAME,
    PUBLIC_RISK_SECTION_ORDER,
    PUBLIC_RISK_SECTION_SPECS,
    STAR_POWER_RULES,
    _combined_american_odds,
    _lean_from_payload,
    generate_public_risk_sections,
    low_risk_leg_eligible,
    is_eligible,
    last_n_recent_values,
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


class RecentSeriesRecencyWindowTests(unittest.TestCase):
    """Locks the recentSeries recency-window fix (truncate the TAIL, not the
    head). Persisted recentSeries must carry the MOST RECENT games, because the
    board / mlb_model series are oldest -> newest and MLB passes the FULL season
    series. Prior code did `series[:10]` and persisted the OLDEST 10 games for
    >10-game players. See SUGGESTED_PARLAY_METHODOLOGY_V2_2026-06-02.md."""

    # ---- last_n_recent_values helper ---------------------------------------
    def test_helper_keeps_most_recent_n_for_long_series(self):
        series = list(range(1, 15))  # 1..14 oldest -> newest
        self.assertEqual(last_n_recent_values(series, 10), list(range(5, 15)))

    def test_helper_does_not_reverse_order(self):
        self.assertEqual(last_n_recent_values([1, 2, 3, 4, 5], 3), [3, 4, 5])

    def test_helper_short_series_unchanged(self):
        self.assertEqual(last_n_recent_values([1, 2, 3], 10), [1, 2, 3])

    def test_helper_empty_and_none_unchanged(self):
        self.assertEqual(last_n_recent_values([], 10), [])
        self.assertEqual(last_n_recent_values(None, 10), [])

    # ---- MLB: full season series -> persisted recent 10 (the FIX) ----------
    def test_mlb_full_series_persists_most_recent_10_not_oldest(self):
        # 14 DISTINCT values, oldest -> newest (mlb_model emits this shape).
        full = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 8, 7, 0, 2]
        leg = normalize_lean(_mlb_lean(recentSeries=full))
        # Persisted = the most recent 10 (tail), NOT the oldest 10 (head).
        self.assertEqual(leg.recentSeries, tuple(float(v) for v in full[-10:]))
        self.assertNotEqual(leg.recentSeries, tuple(float(v) for v in full[:10]))
        self.assertEqual(len(leg.recentSeries), 10)
        # Order preserved (not reversed): last persisted == newest game value.
        self.assertEqual(leg.recentSeries[-1], float(full[-1]))

    def test_persisted_L5_and_L10_match_full_series_tail(self):
        full = [2, 0, 1, 3, 2, 1, 0, 4, 2, 1, 3, 0, 5, 1]
        leg = normalize_lean(_mlb_lean(recentSeries=full))
        # L10 window = persisted series == full[-10:]; L5 window = its tail.
        self.assertEqual(list(leg.recentSeries), [float(v) for v in full[-10:]])
        self.assertEqual(list(leg.recentSeries[-5:]), [float(v) for v in full[-5:]])

    def test_recent10count_reflects_full_count_even_when_truncated(self):
        full = list(range(1, 15))  # 14 valid games
        leg = normalize_lean(_mlb_lean(recentSeries=full))
        self.assertEqual(leg.recent10Count, 14, "recent10Count is the full count")
        self.assertEqual(len(leg.recentSeries), 10, "persisted window capped at 10")

    def test_mlb_short_series_unchanged(self):
        leg = normalize_lean(_mlb_lean(recentSeries=[1, 0, 1]))
        self.assertEqual(leg.recentSeries, (1.0, 0.0, 1.0))

    def test_mlb_empty_series_unchanged(self):
        leg = normalize_lean(_mlb_lean(recentSeries=[]))
        self.assertEqual(leg.recentSeries, ())

    # ---- NBA: recent10 already <= 10 oldest->newest -> no-op ---------------
    def test_nba_recent10_already_capped_is_unchanged(self):
        r10 = [4, 5, 6, 7, 8, 5, 6, 7, 8, 9]  # 10 values, oldest -> newest
        leg = normalize_lean(_nba_lean(recent10=r10))
        self.assertEqual(leg.recentSeries, tuple(float(v) for v in r10))
        self.assertEqual(leg.recentSeries[-1], 9.0, "newest value preserved at tail")

    # ---- round-trip (_lean_from_payload) keeps the tail too ----------------
    def test_lean_from_payload_keeps_recent_tail(self):
        full = list(range(1, 13))  # 12 values oldest -> newest
        payload = {
            "sport": "mlb",
            "leanId": "X-batter_hits-0.5",
            "playerId": 2001,
            "market": "batter_hits",
            "side": "Over",
            "line": 0.5,
            "oddsForSide": -150,
            "recent10Count": 12,
            "recentSeries": full,
        }
        leg = _lean_from_payload(payload)
        self.assertEqual(leg.recentSeries, tuple(float(v) for v in full[-10:]))


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

    # ------------------------------------------------------------------
    # PR #115 DNP guard
    # ------------------------------------------------------------------

    def test_dnp_guard_nba_conservative_requires_7_recent10(self):
        """Conservative NBA leg with only 6 recent values is rejected.

        Catches the 5/25 audit pattern where DNP players (Soto, Ruiz,
        Schroder, Bauers) had insufficient activity but still slipped
        into safe lanes."""
        thin = normalize_lean(_nba_lean(recent10=[5, 6, 7, 5, 6, 7]))
        full = normalize_lean(_nba_lean(recent10=[5, 6, 7, 5, 6, 7, 8, 9]))
        self.assertFalse(is_eligible(thin, CONSERVATIVE_RULES),
                         msg="NBA leg with recent10Count=6 must be rejected from Conservative")
        self.assertTrue(is_eligible(full, CONSERVATIVE_RULES),
                        msg="NBA leg with recent10Count=8 must be allowed in Conservative")

    def test_dnp_guard_nba_balanced_requires_5_recent10(self):
        """Balanced is the relaxed-vs-Conservative tier."""
        thin = normalize_lean(_nba_lean(recent10=[5, 6, 7, 8]))
        full = normalize_lean(_nba_lean(recent10=[5, 6, 7, 8, 9, 6]))
        self.assertFalse(is_eligible(thin, BALANCED_RULES),
                         msg="Balanced still excludes recent10Count=4")
        self.assertTrue(is_eligible(full, BALANCED_RULES))

    def test_dnp_guard_aggressive_loose_but_excludes_empty(self):
        """Aggressive/Longshot tolerates more volatility but still
        excludes legs with zero or near-zero recent activity."""
        empty = normalize_lean(_nba_lean(recent10=[], confidence="Low", edgePct=1.5))
        thin = normalize_lean(_nba_lean(recent10=[5, 6, 7], confidence="Low", edgePct=1.5))
        self.assertFalse(is_eligible(empty, AGGRESSIVE_RULES),
                         msg="Aggressive must still exclude empty recent10")
        self.assertTrue(is_eligible(thin, AGGRESSIVE_RULES),
                        msg="Aggressive allows recent10Count=3 (loosest tier)")

    def test_dnp_guard_mlb_conservative_requires_5_series(self):
        """MLB Conservative requires len(recentSeries) >= 5."""
        thin = normalize_lean(_mlb_lean(recentSeries=[1, 0, 1, 1]))
        full = normalize_lean(_mlb_lean(recentSeries=[1, 0, 1, 1, 2]))
        self.assertFalse(is_eligible(thin, CONSERVATIVE_RULES),
                         msg="MLB leg with 4-game series must be rejected from Conservative")
        self.assertTrue(is_eligible(full, CONSERVATIVE_RULES))

    def test_dnp_guard_mlb_aggressive_min_3_series(self):
        thin = normalize_lean(_mlb_lean(recentSeries=[1, 0], confidence="Low", edgePct=1.5))
        ok = normalize_lean(_mlb_lean(recentSeries=[1, 0, 1], confidence="Low", edgePct=1.5))
        self.assertFalse(is_eligible(thin, AGGRESSIVE_RULES))
        self.assertTrue(is_eligible(ok, AGGRESSIVE_RULES))

    # ------------------------------------------------------------------
    # PR #116 — recentGames metadata pass-through
    # ------------------------------------------------------------------

    def test_recent_games_metadata_passes_through_normalize(self):
        """When the upstream board lean carries `recentGames`, the
        normalizer must preserve it on the OptimizerLean — and only
        clean it up enough to stay JSON-safe."""
        raw = _nba_lean(
            recent10=[5, 6, 7, 8, 9],
            recentGames=[
                {"date": "2026-05-15", "opponent": "SAS", "isHome": True, "value": 5},
                {"date": "2026-05-17", "opponent": "DAL", "isHome": False, "value": 6},
                {"date": "2026-05-20", "opponent": "LAL", "isHome": True, "value": 7},
            ],
        )
        leg = normalize_lean(raw)
        self.assertEqual(len(leg.recentGames), 3)
        self.assertEqual(leg.recentGames[0]["date"], "2026-05-15")
        self.assertEqual(leg.recentGames[0]["opponent"], "SAS")
        self.assertEqual(leg.recentGames[0]["isHome"], True)
        self.assertEqual(leg.recentGames[0]["value"], 5.0)
        # Numeric series still populated independently.
        self.assertEqual(leg.recentSeries, (5.0, 6.0, 7.0, 8.0, 9.0))

    def test_recent_games_missing_is_empty_tuple(self):
        """No `recentGames` on the source lean → empty tuple (not None)."""
        leg = normalize_lean(_nba_lean())
        self.assertEqual(leg.recentGames, ())

    def test_recent_games_drops_rows_with_invalid_value(self):
        """Rows without a numeric `value` are excluded — never invented."""
        raw = _nba_lean(recentGames=[
            {"date": "2026-05-15", "opponent": "SAS", "isHome": True, "value": 5},
            {"date": "2026-05-17", "opponent": "DAL", "isHome": False, "value": "not-a-number"},
            {"date": "2026-05-20", "opponent": "LAL", "isHome": True, "value": 7},
        ])
        leg = normalize_lean(raw)
        self.assertEqual(len(leg.recentGames), 2)
        self.assertEqual([g["date"] for g in leg.recentGames],
                         ["2026-05-15", "2026-05-20"])

    def test_recent_games_caps_at_10(self):
        raw = _nba_lean(recentGames=[
            {"date": f"2026-05-{10+i}", "opponent": "X", "isHome": True, "value": float(i)}
            for i in range(15)
        ])
        leg = normalize_lean(raw)
        self.assertEqual(len(leg.recentGames), 10)

    def test_recent_games_invalid_opponent_becomes_none(self):
        raw = _nba_lean(recentGames=[
            {"date": "2026-05-15", "opponent": 12345, "isHome": True, "value": 5},
        ])
        leg = normalize_lean(raw)
        self.assertIsNone(leg.recentGames[0]["opponent"],
                          msg="non-string opponent must be set to None, never fabricated")

    def test_recent_games_invalid_home_flag_becomes_none(self):
        raw = _nba_lean(recentGames=[
            {"date": "2026-05-15", "opponent": "SAS", "isHome": "home", "value": 5},
        ])
        leg = normalize_lean(raw)
        self.assertIsNone(leg.recentGames[0]["isHome"])


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

    def test_balanced_re_admits_pitcher_strikeouts(self):
        # PR `fix/parlays-mlb-market-diversity`: pitcher_strikeouts
        # was previously blocked at the Balanced eligibility gate.
        # The PR re-admits it because:
        #   - `confidence=("High","Medium")` already filters out
        #     low-conviction pitcher legs.
        #   - `mlb_max_volatile_legs=1` caps at most ONE volatile leg
        #     per Balanced slip — so a slip can never become
        #     "strikeouts + strikeouts + strikeouts".
        #   - Market stability weight (0.70) keeps strikeouts ranked
        #     below hits naturally — surfacing only when a Medium leg
        #     is the best alternative to a third hits leg.
        leg = normalize_lean(_mlb_lean(market="pitcher_strikeouts", confidence="High", edgePct=8))
        self.assertTrue(is_eligible(leg, BALANCED_RULES))
        self.assertTrue(is_eligible(leg, AGGRESSIVE_RULES))
        # Star Power continues to exclude pitcher props (the lane is
        # for recognizable BATTERS).
        self.assertFalse(is_eligible(leg, STAR_POWER_RULES))

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

    # PR `fix/parlays-mlb-market-diversity` — three locks below pin the
    # new across-card market diversity behavior added to
    # `_select_diverse`. The audit (5/27 snapshot) found 100% of
    # visible MLB-only slip legs were `batter_hits` despite the leg
    # pool containing total_bases + H+R+RBI + strikeouts variety.

    def _mlb_pool_with_market_variety(self) -> list[dict]:
        """Build an MLB leg pool with strong leans across multiple
        markets so the diversifier has alternatives. Eight high-edge
        legs spread across hits / total_bases / H+R+RBI / strikeouts
        with different players + games."""
        pool: list[dict] = []
        spec = [
            # (player, game, team, market, line, edgePct)
            ("Mookie Betts", "g_la", "LAD", "batter_hits", 0.5, 11),
            ("Aaron Judge", "g_ny", "NYY", "batter_hits", 0.5, 12),
            ("Juan Soto", "g_nym", "NYM", "batter_hits", 0.5, 10),
            ("Corbin Carroll", "g_az", "AZ", "batter_total_bases", 1.5, 10),
            ("Ketel Marte", "g_az", "AZ", "batter_total_bases", 1.5, 11),
            ("William Contreras", "g_mil", "MIL", "batter_hits_runs_rbis", 1.5, 9),
            ("Spencer Steer", "g_cin", "CIN", "batter_hits_runs_rbis", 1.5, 10),
            ("Jacob deGrom", "g_tex", "TEX", "pitcher_strikeouts", 6.5, 9),
        ]
        for i, (player, game, team, market, line, edge) in enumerate(spec):
            pool.append({
                "_sport": "mlb",
                "id": f"{player}-{market}",
                "gameId": game,
                "playerId": 1000 + i,
                "playerName": player,
                "team": team,
                "opponent": "OPP",
                "market": market,
                "lean": "Over",
                "side": "Over",
                "line": line,
                "projection": line + 0.5,
                "edgePct": edge,
                "confidence": "High",
                "oddsOver": -150,
                "oddsUnder": +130,
                "bookmaker": "draftkings",
                "recentSeries": [1, 2, 1, 1, 2],  # >= dnp_min_mlb_series
                "isStar": True,
                "riskFlags": [],
            })
        return pool

    def test_balanced_visible_slips_mix_markets_when_alternates_exist(self):
        # Pool spans hits + total_bases + H+R+RBI + strikeouts on
        # different players/games. With the new market-diversity
        # penalty in `_select_diverse`, visible Balanced slips should
        # surface MORE than one distinct market across the top 3.
        pool = self._mlb_pool_with_market_variety()
        slips = optimize(pool, profile="balanced", num_candidates=3)
        self.assertGreaterEqual(len(slips), 1)
        markets = set()
        for s in slips:
            for leg in s.legs:
                markets.add(leg.market)
        self.assertGreaterEqual(
            len(markets), 2,
            f"Balanced visible slips should mix at least 2 markets "
            f"when the pool has variety; got {markets}",
        )

    def test_star_power_visible_slips_mix_markets_when_alternates_exist(self):
        # Star Power was hits-only before this PR. With the expanded
        # allowlist + diversity penalty, it should now surface a mix
        # of hits / total_bases / H+R+RBI across visible slips.
        pool = self._mlb_pool_with_market_variety()
        slips = optimize(pool, profile="star_power", num_candidates=3)
        # Pool is star-flagged so the strict-star gate passes.
        if len(slips) >= 2:
            markets = set()
            for s in slips:
                for leg in s.legs:
                    markets.add(leg.market)
            self.assertGreaterEqual(
                len(markets), 2,
                f"Star Power visible slips should mix at least 2 markets "
                f"when the pool has variety; got {markets}",
            )

    def test_market_diversity_does_not_force_inferior_legs(self):
        # If only hits legs are eligible (no alternative markets in
        # the pool), the diversifier must NOT skip viable hits slips
        # just to chase a market it can't reach. Same-market repetition
        # is the honest output.
        pool: list[dict] = []
        for i, player in enumerate(["Mookie Betts", "Aaron Judge", "Juan Soto", "Corbin Carroll", "Ketel Marte"]):
            pool.append({
                "_sport": "mlb",
                "id": f"{player}-hits",
                "gameId": f"g_{i}",
                "playerId": 2000 + i,
                "playerName": player,
                "team": f"T{i}",
                "opponent": "OPP",
                "market": "batter_hits",
                "lean": "Over",
                "side": "Over",
                "line": 0.5,
                "projection": 1.0,
                "edgePct": 10,
                "confidence": "High",
                "oddsOver": -150,
                "oddsUnder": +130,
                "bookmaker": "draftkings",
                "recentSeries": [1, 1, 1, 2, 1],
                "isStar": True,
                "riskFlags": [],
            })
        slips = optimize(pool, profile="balanced", num_candidates=3)
        # We get slips back (the pool supports balanced 3-leg builds).
        # Every leg is batter_hits — proof the diversifier ranks down
        # but never drops viable hits slips when no alternatives exist.
        self.assertGreaterEqual(len(slips), 1)
        for s in slips:
            for leg in s.legs:
                self.assertEqual(leg.market, "batter_hits",
                                 "Diversity must not force a market that doesn't exist in the pool")


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


class GameTimeThreadingTests(unittest.TestCase):
    """PR `feature/leg-game-time-threading` — lock the behavior that
    real board times flow through `normalize_lean` onto the leg
    payload, and the date-only fallback when the source doesn't carry
    a usable time."""

    def test_normalize_passes_mlb_commenceTime(self):
        raw = _mlb_lean(commenceTime="2026-05-28T17:11:00Z")
        leg = normalize_lean(raw)
        self.assertEqual(leg.commenceTime, "2026-05-28T17:11:00Z")
        self.assertIsNone(leg.gameTime)

    def test_normalize_passes_nba_gameTime(self):
        raw = _nba_lean()
        raw["gameTime"] = "8:30 PM ET"
        leg = normalize_lean(raw)
        self.assertEqual(leg.gameTime, "8:30 PM ET")
        # NBA boards don't write commenceTime today; tolerate that.
        self.assertIsNone(leg.commenceTime)

    def test_normalize_missing_time_is_none(self):
        raw = _nba_lean()
        leg = normalize_lean(raw)
        self.assertIsNone(leg.commenceTime)
        self.assertIsNone(leg.gameTime)

    def test_normalize_non_string_time_is_treated_as_missing(self):
        # Don't crash, just drop the field.
        raw = _nba_lean()
        raw["gameTime"] = 12345
        raw["commenceTime"] = ""
        leg = normalize_lean(raw)
        self.assertIsNone(leg.gameTime)
        self.assertIsNone(leg.commenceTime)

    def test_round_trip_through_payload_preserves_times(self):
        raw = _nba_lean()
        raw["gameTime"] = "8:30 PM ET"
        leg = normalize_lean(raw)
        # Build the legPool payload shape `snapshot_optimizer` writes,
        # then reconstruct via `_lean_from_payload` and check the
        # public-section path preserves the time fields.
        payload = {
            "sport": leg.sport,
            "leanId": leg.leanId,
            "gameId": leg.gameId,
            "playerId": leg.playerId,
            "playerName": leg.playerName,
            "team": leg.team,
            "opponent": leg.opponent,
            "market": leg.market,
            "marketLabel": leg.marketLabel,
            "side": leg.side,
            "line": leg.line,
            "projection": leg.projection,
            "edgePct": leg.edgePct,
            "confidence": leg.confidence,
            "bookmaker": leg.bookmaker,
            "oddsForSide": leg.oddsForSide,
            "recent10Count": leg.recent10Count,
            "recentSeries": list(leg.recentSeries),
            "recentGames": [dict(g) for g in leg.recentGames],
            "isAnomaly": leg.isAnomaly,
            "isVolatileMlb": leg.isVolatileMlb,
            "starTier": leg.starTier,
            "isStar": leg.starTier != "none",
            "commenceTime": leg.commenceTime,
            "gameTime": leg.gameTime,
        }
        rebuilt = _lean_from_payload(payload)
        self.assertEqual(rebuilt.gameTime, "8:30 PM ET")
        self.assertIsNone(rebuilt.commenceTime)

    def test_public_risk_section_slips_carry_time(self):
        # Build a multi-game MLB pool with explicit commenceTimes; the
        # public-section selector must preserve them.
        pool: list[OptimizerLean] = []
        for i in range(20):
            raw = _mlb_lean(
                id=f"mlb_t_{i}",
                playerName=f"MLB Player {i}",
                playerId=30000 + i,
                gameId=f"mlb_gt_{i // 2}",
                market=("batter_hits" if i % 2 == 0 else "batter_total_bases"),
                line=0.5 + (i % 3) * 0.5,
                edgePct=8.0,
                oddsOver=-110 + (i % 5) * 15,
                oddsUnder=+95,
                confidence="High",
                commenceTime=f"2026-05-28T1{7 + (i % 3)}:10:00Z",
            )
            pool.append(normalize_lean(raw))
        out = generate_public_risk_sections(pool, date="2026-05-28")
        any_time_found = False
        for by_sport in out.values():
            for slips in by_sport.values():
                for slip in slips:
                    for leg in slip.legs:
                        if leg.commenceTime:
                            any_time_found = True
                            self.assertRegex(leg.commenceTime, r"^2026-05-28T\d{2}:\d{2}:\d{2}Z$")
        self.assertTrue(
            any_time_found,
            "Expected at least one public-section slip leg to carry commenceTime",
        )


class PublicRiskSectionTests(unittest.TestCase):
    """Lock the user-spec ranges for the public risk sections and the
    honest "both odds + leg count must align" rule."""

    def _build_pool(self, *, n_nba: int = 0, n_mlb: int = 0) -> list[OptimizerLean]:
        legs: list[OptimizerLean] = []
        for i in range(n_nba):
            legs.append(normalize_lean(_nba_lean(
                id=f"nba_{i}",
                playerName=f"NBA Player {i}",
                playerId=10000 + i,
                gameId=f"nba_g{i // 2}",  # 2 legs per game so same-game cap matters
                market=("PTS" if i % 2 == 0 else "REB"),
                line=10.5 + i * 0.5,
                edgePct=8.0,
                oddsOver=-120 + (i % 4) * 10,  # mix of -120/-110/-100/-90
                oddsUnder=+100 - (i % 4) * 10,
                confidence="High",
            )))
        for i in range(n_mlb):
            legs.append(normalize_lean(_mlb_lean(
                id=f"mlb_{i}",
                playerName=f"MLB Player {i}",
                playerId=20000 + i,
                gameId=f"mlb_g{i // 2}",
                market=("batter_hits" if i % 2 == 0 else "batter_total_bases"),
                line=0.5 + (i % 3) * 0.5,
                edgePct=7.5,
                oddsOver=-110 + (i % 5) * 15,
                oddsUnder=+95 - (i % 5) * 12,
                confidence="High",
            )))
        return legs

    def test_section_order_is_canonical(self):
        self.assertEqual(
            PUBLIC_RISK_SECTION_ORDER, ("low", "medium", "high", "longshot"),
        )

    def test_section_specs_match_user_ranges(self):
        # User spec: Low <300, Medium 300-599, High 600-999, Longshot >=1000.
        self.assertEqual(PUBLIC_RISK_SECTION_SPECS["low"]["max_am_exclusive"], 300.0)
        self.assertEqual(PUBLIC_RISK_SECTION_SPECS["medium"]["min_am_inclusive"], 300.0)
        self.assertEqual(PUBLIC_RISK_SECTION_SPECS["medium"]["max_am_exclusive"], 600.0)
        self.assertEqual(PUBLIC_RISK_SECTION_SPECS["high"]["min_am_inclusive"], 600.0)
        self.assertEqual(PUBLIC_RISK_SECTION_SPECS["high"]["max_am_exclusive"], 1000.0)
        self.assertEqual(PUBLIC_RISK_SECTION_SPECS["longshot"]["min_am_inclusive"], 1000.0)
        # Leg-count bands.
        # Low capped to exactly 2 legs (simulation-backed tightening):
        # conservative lane stays short so the ~56% leg rate converts to a
        # materially higher card hit rate.
        self.assertEqual(
            (PUBLIC_RISK_SECTION_SPECS["low"]["min_legs"],
             PUBLIC_RISK_SECTION_SPECS["low"]["max_legs"]),
            (2, 2),
        )
        self.assertEqual(
            (PUBLIC_RISK_SECTION_SPECS["medium"]["min_legs"],
             PUBLIC_RISK_SECTION_SPECS["medium"]["max_legs"]),
            (3, 4),
        )
        self.assertEqual(
            (PUBLIC_RISK_SECTION_SPECS["high"]["min_legs"],
             PUBLIC_RISK_SECTION_SPECS["high"]["max_legs"]),
            (4, 5),
        )
        self.assertEqual(
            (PUBLIC_RISK_SECTION_SPECS["longshot"]["min_legs"],
             PUBLIC_RISK_SECTION_SPECS["longshot"]["max_legs"]),
            (5, 6),
        )

    def test_empty_pool_returns_empty_buckets(self):
        out = generate_public_risk_sections([], date="2026-05-28")
        for key in PUBLIC_RISK_SECTION_ORDER:
            self.assertIn(key, out)
            for sport in ("all", "nba", "mlb", "multi"):
                self.assertEqual(out[key][sport], [])

    def test_combined_american_odds_handles_missing_price(self):
        leg_a = normalize_lean(_nba_lean(playerName="A"))
        leg_b = normalize_lean(_nba_lean(playerName="B", oddsOver=None, oddsUnder=None))
        # leg_b has no usable price after normalize → odds is None
        self.assertIsNone(leg_b.oddsForSide)
        self.assertIsNone(_combined_american_odds([leg_a, leg_b]))

    def test_combined_american_odds_two_minus_110_is_about_plus_265(self):
        legs = [
            normalize_lean(_nba_lean(playerName="A", oddsOver=-110)),
            normalize_lean(_nba_lean(playerName="B", oddsOver=-110, id="b", playerId=2)),
        ]
        am = _combined_american_odds(legs)
        # 1.909^2 = 3.645 → am = +265
        self.assertIsNotNone(am)
        self.assertGreater(am, 250)
        self.assertLess(am, 280)

    def test_every_slip_meets_both_odds_and_leg_count(self):
        # Diverse pool so each section can produce >0 slips honestly.
        pool = self._build_pool(n_nba=20, n_mlb=20)
        out = generate_public_risk_sections(pool, date="2026-05-28")
        for section_key, by_sport in out.items():
            spec = PUBLIC_RISK_SECTION_SPECS[section_key]
            for sport, slips in by_sport.items():
                for slip in slips:
                    am = _combined_american_odds(slip.legs)
                    self.assertIsNotNone(am, f"{section_key}/{sport} slip missing price")
                    self.assertGreaterEqual(am, spec["min_am_inclusive"])
                    self.assertLess(am, spec["max_am_exclusive"])
                    self.assertGreaterEqual(len(slip.legs), spec["min_legs"])
                    self.assertLessEqual(len(slip.legs), spec["max_legs"])

    def test_low_cards_capped_at_two_legs(self):
        # Simulation-backed tightening: Low is the conservative lane, exactly 2 legs.
        pool = self._build_pool(n_nba=20, n_mlb=20)
        out = generate_public_risk_sections(pool, date="2026-05-28")
        for sport, slips in out["low"].items():
            for slip in slips:
                self.assertLessEqual(len(slip.legs), 2, f"Low/{sport} card must be <=2 legs")

    def test_edge_cap_excludes_inverted_high_edge_legs(self):
        # Realized edge is inverted above ~10%: edge>=20 must never publish in any
        # section; edge>=15 must not appear in Low/Medium. Edge never promotes.
        pool = self._build_pool(n_nba=20, n_mlb=20)
        pool.append(normalize_lean(_mlb_lean(
            id="hi25", playerName="HiEdge25", playerId=30001, gameId="mlb_hi1",
            market="batter_hits", edgePct=25.0, oddsOver=-130, oddsUnder=110)))
        pool.append(normalize_lean(_mlb_lean(
            id="hi16", playerName="HiEdge16", playerId=30002, gameId="mlb_hi2",
            market="batter_hits", edgePct=16.0, oddsOver=-130, oddsUnder=110)))
        out = generate_public_risk_sections(pool, date="2026-05-28")
        for section_key, by_sport in out.items():
            for slips in by_sport.values():
                for slip in slips:
                    for leg in slip.legs:
                        e = float(leg.edgePct or 0.0)
                        self.assertLess(e, 20.0, f"edge>=20 must not publish ({section_key})")
                        if section_key in ("low", "medium"):
                            self.assertLess(e, 15.0, f"edge>=15 must not be in {section_key}")

    def test_no_duplicate_players_within_slip(self):
        pool = self._build_pool(n_nba=10, n_mlb=20)
        out = generate_public_risk_sections(pool, date="2026-05-28")
        for by_sport in out.values():
            for slips in by_sport.values():
                for slip in slips:
                    names = [l.playerName for l in slip.legs]
                    self.assertEqual(
                        len(names), len(set(names)),
                        f"Duplicate player in slip: {names}",
                    )

    def test_same_game_cap_holds_per_slip(self):
        # 1 NBA game + 1 MLB game with many legs each. The same-game cap
        # is 2 — so any 3+ leg slip must span more than one game.
        pool = self._build_pool(n_nba=12, n_mlb=12)
        out = generate_public_risk_sections(pool, date="2026-05-28")
        for by_sport in out.values():
            for slips in by_sport.values():
                for slip in slips:
                    if len(slip.legs) < 3:
                        continue
                    games: dict[str, int] = {}
                    for l in slip.legs:
                        if l.gameId:
                            games[l.gameId] = games.get(l.gameId, 0) + 1
                    self.assertLessEqual(
                        max(games.values(), default=0), 2,
                        f"Over-cap same-game stack in slip: {games}",
                    )

    def test_mlb_only_can_fill_higher_sections(self):
        # MLB-only with multiple games + diverse odds should produce
        # at least one Medium/High/Longshot slip honestly.
        pool = self._build_pool(n_mlb=30)
        out = generate_public_risk_sections(pool, date="2026-05-28")
        # LOW now requires trusted recent form (low_risk_leg_eligible). The
        # default _build_pool legs carry no recentGames provenance, so LOW is
        # correctly EMPTY (fail-closed) — higher sections are unaffected.
        self.assertEqual(len(out["low"]["mlb"]), 0)
        # Higher sections may produce something if the pool is rich.
        # We assert at least Medium fills — it's the most permissive of
        # the >=3 leg sections.
        self.assertGreater(
            len(out["medium"]["mlb"]) + len(out["high"]["mlb"]),
            0,
            "MLB-only should generate at least one Medium/High slip",
        )

    def test_lean_from_payload_round_trips_odds_and_player(self):
        # Mirrors what `snapshot_optimizer._leg_to_payload` produces.
        payload = {
            "sport": "nba", "leanId": "x1", "gameId": "g1",
            "playerId": 333, "playerName": "Round Tripper",
            "team": "OKC", "opponent": "SAS",
            "market": "PTS", "marketLabel": "Points",
            "side": "Over", "line": 22.5, "projection": 25.0,
            "edgePct": 9.5, "confidence": "High",
            "bookmaker": "draftkings", "oddsForSide": -118,
            "recent10Count": 9, "recentSeries": [22, 25, 28],
            "recentGames": [], "isAnomaly": False,
            "isVolatileMlb": False, "starTier": "none",
        }
        leg = _lean_from_payload(payload)
        self.assertEqual(leg.sport, "nba")
        self.assertEqual(leg.playerName, "Round Tripper")
        self.assertEqual(leg.oddsForSide, -118)
        self.assertEqual(leg.market, "PTS")
        self.assertEqual(leg.side, "Over")

    def test_nba_single_game_slate_keeps_higher_buckets_honest(self):
        # All NBA legs from a single game → NBA-only Medium/High/Longshot
        # MUST be empty (same-game cap = 2 blocks 3+ leg slips).
        pool = [
            normalize_lean(_nba_lean(
                id=f"sg_{i}", playerName=f"P{i}", playerId=80000 + i,
                gameId="single_game",
                market=("PTS" if i % 2 == 0 else "REB"),
                line=10 + i, edgePct=8.0,
                oddsOver=-115, oddsUnder=+100,
            )) for i in range(20)
        ]
        out = generate_public_risk_sections(pool, date="2026-05-28")
        # The honest behavior: 0 NBA-only slips for sections needing >=3 legs.
        self.assertEqual(out["medium"]["nba"], [])
        self.assertEqual(out["high"]["nba"], [])
        self.assertEqual(out["longshot"]["nba"], [])


class PublicRiskSectionDepthCurationTests(unittest.TestCase):
    """PR `feature/generation-curation-public-risk-depth` (2026-06-05) —
    deeper + more market-diverse publicRiskSections. The selector still only
    re-orders already-eligible candidates and never pads."""

    def _rich_mlb_pool(self, *, n_players: int, markets: list[str]) -> list[OptimizerLean]:
        """A supply-rich MLB pool: many distinct players across several markets,
        conservative odds so 2-leg slips land in Low. LOW-RISK-ELIGIBLE: every
        leg carries trusted, non-stale recent form (10 recent games clearing the
        line → 100% L10) and odds <= -150, so the new low_risk_leg_eligible gate
        admits them. Slate date in these tests is 2026-06-05."""
        # 10 recent games within 21 days of the 2026-06-05 slate, all clearing 0.5.
        recent_games = [
            {"date": d, "opponent": "OPP", "isHome": True, "value": 2.0}
            for d in (
                "2026-05-22", "2026-05-24", "2026-05-26", "2026-05-28", "2026-05-30",
                "2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05",
            )
        ]
        legs: list[OptimizerLean] = []
        for i in range(n_players):
            legs.append(normalize_lean(_mlb_lean(
                id=f"rich_{i}",
                playerName=f"Rich MLB {i}",
                playerId=30000 + i,
                gameId=f"rich_g{i // 2}",  # 2 players per game
                market=markets[i % len(markets)],
                line=0.5,
                edgePct=8.0,
                oddsOver=-160,  # <= -150 Low-Risk odds floor
                oddsUnder=+140,
                confidence="High",
                recentSeries=[2.0] * 10,   # 10/10 clear line 0.5 → L10 100%
                recentGames=recent_games,  # trusted, non-stale provenance
            )))
        return legs

    def test_target_raised_allows_more_than_four_when_supply_exists(self):
        # Rich supply (16 players, 4 markets) → Low MLB bucket should exceed the
        # old cap of 4 (target is now 6).
        pool = self._rich_mlb_pool(
            n_players=16,
            markets=["batter_hits", "batter_total_bases", "batter_hits_runs_rbis", "batter_runs_scored"],
        )
        out = generate_public_risk_sections(pool, date="2026-06-05")
        low_mlb = out["low"]["mlb"]
        self.assertGreater(len(low_mlb), 4, "deeper target should surface >4 when supply exists")
        self.assertLessEqual(len(low_mlb), 6, "must never exceed target_per_bucket")

    def test_no_duplicate_slip_ids_in_any_bucket(self):
        pool = self._rich_mlb_pool(
            n_players=16,
            markets=["batter_hits", "batter_total_bases", "batter_hits_runs_rbis", "batter_runs_scored"],
        )
        out = generate_public_risk_sections(pool, date="2026-06-05")
        for by_sport in out.values():
            for slips in by_sport.values():
                ids = [s.slipId for s in slips if getattr(s, "slipId", None)]
                self.assertEqual(len(ids), len(set(ids)), "no duplicate slip IDs")

    def test_market_diversity_spread_across_deeper_bucket(self):
        # With 4 markets available, the deeper Low MLB bucket should span MORE
        # than one distinct market (the escalating market-concentration penalty
        # stops a single market dominating all slots).
        pool = self._rich_mlb_pool(
            n_players=16,
            markets=["batter_hits", "batter_total_bases", "batter_hits_runs_rbis", "batter_runs_scored"],
        )
        out = generate_public_risk_sections(pool, date="2026-06-05")
        low_mlb = out["low"]["mlb"]
        markets = {l.market for s in low_mlb for l in s.legs}
        self.assertGreaterEqual(
            len(markets), 2, "deeper bucket should span multiple markets, not cluster on one",
        )

    def test_no_padding_when_supply_is_short(self):
        # Only 2 players → at most 1 two-leg slip; never padded up to target.
        pool = self._rich_mlb_pool(n_players=2, markets=["batter_hits"])
        out = generate_public_risk_sections(pool, date="2026-06-05")
        self.assertLessEqual(len(out["low"]["mlb"]), 1)

    def test_only_modeled_sports_in_published_slips(self):
        # NBA + MLB both supplied → every published leg is a modeled sport.
        pool = self._rich_mlb_pool(
            n_players=8, markets=["batter_hits", "batter_total_bases"],
        )
        for i in range(8):
            pool.append(normalize_lean(_nba_lean(
                id=f"mix_nba_{i}", playerName=f"Mix NBA {i}", playerId=40000 + i,
                gameId="mix_nba_g", market=("PTS" if i % 2 == 0 else "REB"),
                line=10.5, edgePct=8.0, oddsOver=-120, oddsUnder=+110, confidence="High",
            )))
        out = generate_public_risk_sections(pool, date="2026-06-05")
        for by_sport in out.values():
            for slips in by_sport.values():
                for s in slips:
                    for leg in s.legs:
                        self.assertIn(leg.sport, ("nba", "mlb"))

    def test_slip_shape_compatible(self):
        pool = self._rich_mlb_pool(n_players=8, markets=["batter_hits", "batter_total_bases"])
        out = generate_public_risk_sections(pool, date="2026-06-05")
        sample = out["low"]["mlb"]
        self.assertTrue(sample, "expected at least one Low MLB slip from rich supply")
        s = sample[0]
        self.assertTrue(hasattr(s, "legs") and len(s.legs) >= 2)
        self.assertTrue(hasattr(s, "score"))
        self.assertTrue(getattr(s, "slipId", None))


class LowRiskLegEligibilityTests(unittest.TestCase):
    """PR `fix/june5-risk-methodology-and-form` (2026-06-05) — Low Risk requires
    trusted, non-stale recent form (>=80% L10) + a conservative price. Fail-closed
    on missing/stale form. No projection/scoring/grading change."""

    SLATE = "2026-06-05"
    FRESH_GAMES = [  # 10 recent games within 21 days of the slate
        {"date": d, "opponent": "OPP", "isHome": True, "value": 2.0}
        for d in ("2026-05-22", "2026-05-24", "2026-05-26", "2026-05-28", "2026-05-30",
                  "2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05")
    ]

    def _leg(self, *, odds, series, line=0.5, side="Over", games=None):
        return normalize_lean(_mlb_lean(
            id="lrt", playerName="LR Tester", playerId=99001, market="batter_hits",
            line=line, lean=side, side=side, oddsOver=odds, oddsUnder=-odds if odds else +120,
            recentSeries=series, recentGames=games if games is not None else self.FRESH_GAMES,
        ))

    def test_plus_money_leg_never_low_even_with_great_form(self):
        leg = self._leg(odds=+130, series=[2.0] * 10)  # 10/10 but +130 > +110
        self.assertFalse(low_risk_leg_eligible(leg, self.SLATE))

    def test_minus104_with_l10_below_80_not_low(self):
        # -104 is within -150..+110 → needs >=90% L10; 7/10 fails.
        leg = self._leg(odds=-104, series=[2, 2, 2, 2, 2, 2, 2, 0, 0, 0])
        self.assertFalse(low_risk_leg_eligible(leg, self.SLATE))

    def test_l10_5of10_not_low(self):
        leg = self._leg(odds=-200, series=[2, 2, 2, 2, 2, 0, 0, 0, 0, 0])  # 5/10
        self.assertFalse(low_risk_leg_eligible(leg, self.SLATE))

    def test_heavy_favorite_l10_8of10_is_low(self):
        leg = self._leg(odds=-200, series=[2, 2, 2, 2, 2, 2, 2, 2, 0, 0])  # 8/10
        self.assertTrue(low_risk_leg_eligible(leg, self.SLATE))

    def test_near_even_imperfect_l5_not_low(self):
        # -104 near-even, 9/10 L10 but last-5 = [2,2,2,2,0] = 4/5 (not perfect)
        # → Low now requires PERFECT 5/5 L5 for a near-even price.
        leg = self._leg(odds=-104, series=[2, 2, 2, 2, 2, 2, 2, 2, 2, 0])
        self.assertFalse(low_risk_leg_eligible(leg, self.SLATE))

    def test_near_even_perfect_l5_is_low_fallback(self):
        # -104 near-even with 10/10 L10 AND perfect 5/5 L5 → eligible (fallback).
        leg = self._leg(odds=-104, series=[2.0] * 10)
        self.assertTrue(low_risk_leg_eligible(leg, self.SLATE))

    def test_even_money_plus100_needs_perfect_l5(self):
        # +100 (even money) with 9/10 L10 but 4/5 L5 → NOT Low (the +100 case
        # the operator flagged). Reserve for higher-risk sections.
        imperfect = self._leg(odds=+100, series=[2, 2, 2, 2, 2, 2, 2, 2, 2, 0])
        self.assertFalse(low_risk_leg_eligible(imperfect, self.SLATE))
        # +100 with perfect 5/5 L5 is allowed by the fallback.
        perfect = self._leg(odds=+100, series=[2.0] * 10)
        self.assertTrue(low_risk_leg_eligible(perfect, self.SLATE))

    def test_plus_money_over_100_never_low(self):
        # +101 is plus-money — never Low even with perfect form.
        leg = self._leg(odds=+101, series=[2.0] * 10)
        self.assertFalse(low_risk_leg_eligible(leg, self.SLATE))

    def test_negative_favorite_needs_90pct_l10(self):
        # -120 favorite (between -150 and -105) needs >=90% L10; 8/10 fails.
        weak = self._leg(odds=-120, series=[2, 2, 2, 2, 2, 2, 2, 2, 0, 0])  # 8/10
        self.assertFalse(low_risk_leg_eligible(weak, self.SLATE))
        strong = self._leg(odds=-120, series=[2, 2, 2, 2, 2, 2, 2, 2, 2, 0])  # 9/10
        self.assertTrue(low_risk_leg_eligible(strong, self.SLATE))

    def test_missing_recent_series_fails_closed(self):
        leg = self._leg(odds=-200, series=[])  # no form
        self.assertFalse(low_risk_leg_eligible(leg, self.SLATE))

    def test_missing_dated_provenance_defers_to_recentseries(self):
        # MLB legs carry recentSeries but no dated recentGames. Staleness can't
        # be checked, so trust defers to recentSeries (>=10) + L10 + odds. A
        # strong 10/10 heavy-favorite leg with no provenance is still eligible.
        leg = self._leg(odds=-200, series=[2.0] * 10, games=[])
        self.assertTrue(low_risk_leg_eligible(leg, self.SLATE))
        # ...but a weak / short series with no provenance still fails closed.
        weak = self._leg(odds=-200, series=[2, 2, 0, 0, 0], games=[])  # <10 sample
        self.assertFalse(low_risk_leg_eligible(weak, self.SLATE))

    def test_stale_regular_season_form_fails_closed(self):
        # Keldon-style: 10 games but latest is 54 days before the slate.
        stale = [{"date": "2026-04-12", "opponent": "DEN", "isHome": True, "value": 18.0}] * 10
        leg = self._leg(odds=-200, line=6.5, series=[18.0] * 10, games=stale)
        self.assertFalse(low_risk_leg_eligible(leg, self.SLATE))


class RecentFormQualityTests(unittest.TestCase):
    """The bounded recent-form (L10→L5) quality signal in _sgp_leg_quality."""

    def test_delta_sign_and_clamp(self):
        # Over 0.5: all-2s = 10/10 hit → +0.5 clamps to +0.30
        strong = normalize_lean(_mlb_lean(line=0.5, lean="Over", side="Over", recentSeries=[2] * 10))
        # Over 0.5: all-0s = 0/10 hit → −0.5 clamps to −0.30
        weak = normalize_lean(_mlb_lean(line=0.5, lean="Over", side="Over", recentSeries=[0] * 10))
        self.assertAlmostEqual(_recent_form_quality_delta(strong), 0.30, places=6)
        self.assertAlmostEqual(_recent_form_quality_delta(weak), -0.30, places=6)

    def test_no_series_is_zero(self):
        none = normalize_lean(_mlb_lean(recentSeries=[]))
        self.assertEqual(_recent_form_quality_delta(none), 0.0)

    def test_falls_back_to_l5_when_under_10(self):
        # 5 values, Over 0.5, 4 hits / 5 → 0.8 → delta 0.30 (clamped from 0.30)
        five = normalize_lean(_mlb_lean(line=0.5, lean="Over", side="Over", recentSeries=[2, 2, 2, 2, 0]))
        self.assertAlmostEqual(_recent_form_quality_delta(five), 0.30, places=6)

    def test_strong_form_outranks_weak_at_equal_edge_and_market(self):
        strong = normalize_lean(_mlb_lean(market="batter_hits", edgePct=8.0, confidence="High",
                                          line=0.5, lean="Over", side="Over", recentSeries=[2] * 10))
        weak = normalize_lean(_mlb_lean(market="batter_hits", edgePct=8.0, confidence="High",
                                        line=0.5, lean="Over", side="Over", recentSeries=[0] * 10))
        self.assertGreater(_sgp_leg_quality(strong), _sgp_leg_quality(weak))

    def test_hot_form_beats_overprojected_big_edge(self):
        # EMERGENCY REVAMP: settled data shows big edge is overprojection (10-20%
        # ~45%, 20%+ ~41%) while hot recent form is predictive. So a hot leg with
        # a tiny edge must now OUTRANK a cold leg with a huge (penalized) edge —
        # the reverse of the old "edge dominates" assumption.
        cold_big_edge = normalize_lean(_mlb_lean(market="batter_hits", edgePct=25.0, confidence="High",
                                                 line=0.5, lean="Over", side="Over", recentSeries=[0] * 10))
        hot_tiny_edge = normalize_lean(_mlb_lean(market="batter_hits", edgePct=1.0, confidence="High",
                                                 line=0.5, lean="Over", side="Over", recentSeries=[2] * 10))
        self.assertGreater(_sgp_leg_quality(hot_tiny_edge), _sgp_leg_quality(cold_big_edge))


class ConfidenceWeightCompressionTests(unittest.TestCase):
    """EMERGENCY REVAMP: the confidence LABEL is not trusted in _sgp_leg_quality
    (settled: High 48.1% < Low 50.6% < Medium 51.2% — inverted). Real labels
    (High/Medium/Low) carry NO differential weight; only insufficient_data is
    penalized. Equal market + series isolate confidence."""

    def _leg(self, conf, edge):
        return normalize_lean(_mlb_lean(market="batter_hits", confidence=conf, edgePct=edge,
                                        line=0.5, lean="Over", side="Over", recentSeries=[1] * 10))

    def test_confidence_label_not_trusted(self):
        # High / Medium / Low score EQUAL at equal edge+market+series — the label
        # is non-predictive so it must not move the ranking either way.
        h, m, l = self._leg("High", 6), self._leg("Medium", 6), self._leg("Low", 6)
        self.assertAlmostEqual(_sgp_leg_quality(h), _sgp_leg_quality(m), places=6)
        self.assertAlmostEqual(_sgp_leg_quality(m), _sgp_leg_quality(l), places=6)

    def test_overprojected_edge_is_penalized(self):
        # A large edge (overprojection, ~41% realized) must score BELOW a modest
        # edge below the threshold, all else equal.
        self.assertGreater(_sgp_leg_quality(self._leg("High", 5)), _sgp_leg_quality(self._leg("High", 25)))

    def test_insufficient_data_stays_unweighted(self):
        # insufficient_data is the only label that is penalized (graded worst).
        self.assertGreater(_sgp_leg_quality(self._leg("Low", 5)), _sgp_leg_quality(self._leg("insufficient_data", 5)))


class MarketReliabilityNudgeTests(unittest.TestCase):
    """The bounded settled-history market-reliability tiebreaker in
    _sgp_leg_quality. Inject a controlled cache so the test is independent of
    the live market-reliability.json artifact."""

    def setUp(self):
        self._orig = po._reliability_cache
        po._reliability_cache = {
            "mlb": {"batter_hits": 0.60, "batter_total_bases": 0.40, "wild": 0.99},
            "nba": {"REB": 0.56},
        }

    def tearDown(self):
        po._reliability_cache = self._orig

    def test_delta_sign_and_clamp(self):
        strong = normalize_lean(_mlb_lean(market="batter_hits"))
        weak = normalize_lean(_mlb_lean(market="batter_total_bases"))
        wild = normalize_lean(_mlb_lean(market="wild"))
        self.assertAlmostEqual(_market_reliability_delta(strong), 0.10, places=6)  # 0.60-0.5=0.10
        self.assertAlmostEqual(_market_reliability_delta(weak), -0.10, places=6)  # 0.40-0.5=-0.10
        # 0.99-0.5=0.49 must clamp to the +0.10 ceiling (no runaway influence)
        self.assertAlmostEqual(_market_reliability_delta(wild), 0.10, places=6)

    def test_unknown_market_is_zero(self):
        unk = normalize_lean(_mlb_lean(market="batter_walks"))
        self.assertEqual(_market_reliability_delta(unk), 0.0)

    def test_reliable_market_outranks_weak_at_equal_edge(self):
        strong = normalize_lean(_mlb_lean(market="batter_hits", edgePct=8.0, confidence="High"))
        weak = normalize_lean(_mlb_lean(market="batter_total_bases", edgePct=8.0, confidence="High"))
        self.assertGreater(_sgp_leg_quality(strong), _sgp_leg_quality(weak))

    def test_reliability_now_drives_over_edge(self):
        # EMERGENCY REVAMP: reliability is now a PRIMARY driver and big edge is a
        # penalty. A strong-market leg with a tiny edge must OUTRANK a weak-market
        # leg with a big (overprojected) edge — the reverse of the old tiebreaker.
        weak_big_edge = normalize_lean(_mlb_lean(market="batter_total_bases", edgePct=20.0, confidence="High"))
        strong_small_edge = normalize_lean(_mlb_lean(market="batter_hits", edgePct=2.0, confidence="High"))
        self.assertGreater(_sgp_leg_quality(strong_small_edge), _sgp_leg_quality(weak_big_edge))


class MarketQuarantineTests(unittest.TestCase):
    """Market status tiers: allowed (>=0.50) / restricted (0.35-0.50, per-player
    consistency) / disabled (<0.35 or explicit). Injects a controlled cache."""

    FRESH_GAMES = [
        {"date": d, "opponent": "OPP", "isHome": True, "value": 2.0}
        for d in ("2026-05-22", "2026-05-24", "2026-05-26", "2026-05-28", "2026-05-30",
                  "2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05")
    ]
    STRONG = [2.0] * 10            # 10/10 over 0.5 → L10 100%
    WEAK = [2, 2, 0, 0, 0, 0, 0, 0, 0, 0]  # 2/10 → L10 20%

    def setUp(self):
        self._orig = po._market_wilson_cache
        po._market_wilson_cache = {
            "mlb": {
                "good": {"wilsonLo": 0.55, "status": None},          # allowed
                "restricted": {"wilsonLo": 0.45, "status": None},    # restricted (0.35-0.50)
                "catastrophic": {"wilsonLo": 0.30, "status": None},  # disabled (<0.35)
                "forced_off": {"wilsonLo": 0.99, "status": "disabled"},  # explicit override
            },
        }

    def tearDown(self):
        po._market_wilson_cache = self._orig

    def _leg(self, market, *, odds=-200, series=None):
        return normalize_lean(_mlb_lean(
            id="mq", playerName="MQ Tester", playerId=99002, market=market,
            line=0.5, lean="Over", side="Over", oddsOver=odds, oddsUnder=-odds,
            recentSeries=series if series is not None else self.STRONG, recentGames=self.FRESH_GAMES,
        ))

    def test_status_derivation_from_wilson(self):
        self.assertEqual(po.market_suggested_status("mlb", "good"), "allowed")
        self.assertEqual(po.market_suggested_status("mlb", "restricted"), "restricted")
        self.assertEqual(po.market_suggested_status("mlb", "catastrophic"), "disabled")

    def test_explicit_status_override_wins(self):
        self.assertEqual(po.market_suggested_status("mlb", "forced_off"), "disabled")

    def test_unmeasured_market_defaults_allowed(self):
        self.assertEqual(po.market_suggested_status("mlb", "never_seen"), "allowed")

    def test_disabled_never_publishes_in_any_section(self):
        leg = self._leg("catastrophic")  # even with perfect form
        for sec in ("low", "medium", "high", "longshot"):
            self.assertFalse(po._market_allowed_for_section(leg, sec, "2026-06-05"))

    def test_allowed_market_everywhere(self):
        leg = self._leg("good")
        for sec in ("low", "medium", "high", "longshot"):
            self.assertTrue(po._market_allowed_for_section(leg, sec, "2026-06-05"))

    def test_restricted_needs_player_consistency(self):
        # Strong-form restricted leg is eligible per tier; weak-form is not.
        strong = self._leg("restricted", series=self.STRONG)
        weak = self._leg("restricted", series=self.WEAK)
        for sec in ("low", "medium", "high", "longshot"):
            self.assertTrue(po._market_allowed_for_section(strong, sec, "2026-06-05"), sec)
            self.assertFalse(po._market_allowed_for_section(weak, sec, "2026-06-05"), sec)

    def test_low_eligible_allowed_or_consistent_restricted(self):
        self.assertTrue(low_risk_leg_eligible(self._leg("good"), "2026-06-05"))
        self.assertFalse(low_risk_leg_eligible(self._leg("catastrophic"), "2026-06-05"))
        self.assertTrue(low_risk_leg_eligible(self._leg("restricted", series=self.STRONG), "2026-06-05"))
        self.assertFalse(low_risk_leg_eligible(self._leg("restricted", series=self.WEAK), "2026-06-05"))


class VolatilityAndBankBuilderEligibilityTests(unittest.TestCase):
    """leg_volatility_score + is_low_volatility_leg + is_bank_builder_eligible
    (high-hit-rate filter mission). Bank Builder is the strictest subset."""

    FRESH_GAMES = [
        {"date": d, "opponent": "OPP", "isHome": True, "value": 2.0}
        for d in ("2026-05-22", "2026-05-24", "2026-05-26", "2026-05-28", "2026-05-30",
                  "2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05")
    ]
    STALE_GAMES = [  # all > 21 days before the 2026-06-05 slate → stale form
        {"date": d, "opponent": "OPP", "isHome": True, "value": 2.0}
        for d in ("2026-04-01", "2026-04-03", "2026-04-05", "2026-04-07", "2026-04-09",
                  "2026-04-11", "2026-04-13", "2026-04-15", "2026-04-17", "2026-04-19")
    ]

    def setUp(self):
        self._orig = po._market_wilson_cache
        po._market_wilson_cache = {
            "mlb": {
                "good": {"wilsonLo": 0.55, "status": None},          # allowed
                "restricted": {"wilsonLo": 0.45, "status": None},    # restricted (per-player)
                "catastrophic": {"wilsonLo": 0.30, "status": None},  # disabled
            },
        }

    def tearDown(self):
        po._market_wilson_cache = self._orig

    def _leg(self, *, market="good", odds=-200, series=None, games="fresh"):
        return normalize_lean(_mlb_lean(
            id="vol", playerName="Vol Tester", playerId=99003, market=market,
            line=0.5, lean="Over", side="Over", oddsOver=odds, oddsUnder=-odds,
            recentSeries=series if series is not None else [2.0] * 10,
            recentGames=self.FRESH_GAMES if games == "fresh" else self.STALE_GAMES,
        ))

    def test_steady_heavy_favorite_is_low_volatility(self):
        leg = self._leg(market="good", odds=-200, series=[2.0] * 10)
        self.assertLessEqual(po.leg_volatility_score(leg, "2026-06-05"), 0.5)
        self.assertTrue(po.is_low_volatility_leg(leg, "2026-06-05"))

    def test_plus_money_increases_volatility(self):
        self.assertGreater(po.leg_volatility_score(self._leg(odds=+120), "2026-06-05"),
                           po.leg_volatility_score(self._leg(odds=-200), "2026-06-05"))

    def test_stale_form_increases_volatility(self):
        self.assertGreater(po.leg_volatility_score(self._leg(games="stale"), "2026-06-05"),
                           po.leg_volatility_score(self._leg(games="fresh"), "2026-06-05"))

    def test_small_sample_increases_volatility(self):
        self.assertGreater(po.leg_volatility_score(self._leg(series=[2.0, 2.0, 2.0]), "2026-06-05"),
                           po.leg_volatility_score(self._leg(series=[2.0] * 10), "2026-06-05"))

    def test_disabled_market_more_volatile_than_allowed(self):
        self.assertGreater(po.leg_volatility_score(self._leg(market="catastrophic"), "2026-06-05"),
                           po.leg_volatility_score(self._leg(market="good"), "2026-06-05"))

    def test_bank_builder_eligible_strictest(self):
        self.assertTrue(po.is_bank_builder_eligible(
            self._leg(market="good", odds=-200, series=[2.0] * 10), "2026-06-05"))

    def test_bank_builder_rejects_shallow_favorite(self):
        self.assertFalse(po.is_bank_builder_eligible(
            self._leg(odds=-120, series=[2.0] * 10), "2026-06-05"))

    def test_bank_builder_restricted_needs_elite_consistency(self):
        # restricted + ELITE exact-market form (10/10) + heavy fav → eligible
        elite = self._leg(market="restricted", odds=-200, series=[2.0] * 10)
        self.assertTrue(po.is_bank_builder_eligible(elite, "2026-06-05"))
        # restricted + Low-eligible-but-not-elite form (8/10 = 80% < 85 bank bar) → rejected
        not_elite = self._leg(market="restricted", odds=-200, series=[2, 2, 2, 2, 2, 2, 2, 2, 0, 0])
        self.assertFalse(po.is_bank_builder_eligible(not_elite, "2026-06-05"))
        # disabled market → never, even with perfect form
        self.assertFalse(po.is_bank_builder_eligible(self._leg(market="catastrophic", odds=-200, series=[2.0] * 10), "2026-06-05"))

    def test_bank_builder_rejects_plus_money_and_stale(self):
        self.assertFalse(po.is_bank_builder_eligible(self._leg(odds=+120), "2026-06-05"))
        self.assertFalse(po.is_bank_builder_eligible(self._leg(games="stale"), "2026-06-05"))


class RestrictedMarketConsistencyTests(unittest.TestCase):
    """Volatile-but-important markets (batter_total_bases / NBA AST /
    pitcher_strikeouts) are RESTRICTED, not blanket-excluded: a leg publishes only
    when the player's exact-market recent form clears the per-tier bar. Weak legs
    stay out; strong-consistency legs can appear. Bank Builder stays strictest."""

    FRESH_GAMES = [
        {"date": d, "opponent": "OPP", "isHome": True, "value": 2.0}
        for d in ("2026-05-22", "2026-05-24", "2026-05-26", "2026-05-28", "2026-05-30",
                  "2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05")
    ]
    STRONG = [2.0] * 10                       # 10/10 over 0.5 → L10 100%
    MID = [2, 2, 2, 2, 2, 2, 0, 0, 0, 0]      # 6/10 → L10 60%
    WEAK = [2, 2, 0, 0, 0, 0, 0, 0, 0, 0]     # 2/10 → L10 20%

    def setUp(self):
        self._orig = po._market_wilson_cache
        po._market_wilson_cache = {
            "mlb": {
                "batter_total_bases": {"wilsonLo": 0.40, "status": None},  # restricted
                "pitcher_strikeouts": {"wilsonLo": 0.42, "status": None},  # restricted
                "batter_hits": {"wilsonLo": 0.51, "status": None},         # allowed
            },
            "nba": {
                "AST": {"wilsonLo": 0.41, "status": None},  # restricted
                "PTS": {"wilsonLo": 0.51, "status": None},  # allowed
            },
        }

    def tearDown(self):
        po._market_wilson_cache = self._orig

    def _leg(self, market, *, odds=-200, series=None, games="fresh"):
        return normalize_lean(_mlb_lean(
            id="rm", playerName="RM Tester", playerId=99004, market=market,
            line=0.5, lean="Over", side="Over", oddsOver=odds, oddsUnder=-odds,
            recentSeries=series if series is not None else self.STRONG,
            recentGames=self.FRESH_GAMES if games == "fresh" else [],
        ))

    # 1 + 2 — batter_total_bases is not blanket-disabled; weak out, strong in.
    def test_total_bases_is_restricted_not_disabled(self):
        self.assertEqual(po.market_suggested_status("mlb", "batter_total_bases"), "restricted")

    def test_weak_total_bases_excluded_everywhere(self):
        weak = self._leg("batter_total_bases", series=self.WEAK)
        for sec in ("low", "medium", "high", "longshot"):
            self.assertFalse(po._market_allowed_for_section(weak, sec, "2026-06-05"), sec)

    def test_strong_total_bases_can_appear(self):
        strong = self._leg("batter_total_bases", series=self.STRONG)
        for sec in ("low", "medium", "high", "longshot"):
            self.assertTrue(po._market_allowed_for_section(strong, sec, "2026-06-05"), sec)
        self.assertTrue(low_risk_leg_eligible(strong, "2026-06-05"))

    # 3 + 4 — NBA AST restricted (status; eligibility shares the same code path).
    def test_ast_is_restricted_not_disabled(self):
        self.assertEqual(po.market_suggested_status("nba", "AST"), "restricted")

    # 5 + 6 — pitcher_strikeouts: weak out of Low/Medium; mid only High; strong all.
    def test_weak_strikeouts_excluded_from_low_and_medium(self):
        weak = self._leg("pitcher_strikeouts", series=self.WEAK)
        self.assertFalse(po._market_allowed_for_section(weak, "low", "2026-06-05"))
        self.assertFalse(po._market_allowed_for_section(weak, "medium", "2026-06-05"))

    def test_mid_consistency_excluded_all_tiers(self):
        # 60% L10 is below the uniform elite bar (80%) → excluded EVERYWHERE.
        # Backtest showed looser bars (60-70%) admitted sub-50% restricted legs.
        mid = self._leg("pitcher_strikeouts", series=self.MID)
        for sec in ("low", "medium", "high", "longshot"):
            self.assertFalse(po._market_allowed_for_section(mid, sec, "2026-06-05"), sec)

    def test_strong_strikeouts_can_appear_all_tiers(self):
        strong = self._leg("pitcher_strikeouts", series=self.STRONG)
        for sec in ("low", "medium", "high", "longshot"):
            self.assertTrue(po._market_allowed_for_section(strong, sec, "2026-06-05"), sec)

    # 7 — Bank Builder: restricted only with strictest consistency.
    def test_bank_builder_restricted_requires_elite(self):
        elite = self._leg("batter_total_bases", odds=-200, series=self.STRONG)      # L10 100%
        good = self._leg("batter_total_bases", odds=-200, series=[2,2,2,2,2,2,2,2,0,0])  # 80% < 85
        self.assertTrue(po.is_bank_builder_eligible(elite, "2026-06-05"))
        self.assertFalse(po.is_bank_builder_eligible(good, "2026-06-05"))

    # 8 — missing exact-market hit-rate / sample → restricted excluded.
    def test_missing_data_excludes_restricted(self):
        no_series = self._leg("batter_total_bases", series=[])
        self.assertFalse(po._market_allowed_for_section(no_series, "high", "2026-06-05"))
        tiny = self._leg("batter_total_bases", series=[2, 2, 2])  # sample 3 < 5
        self.assertFalse(po._market_allowed_for_section(tiny, "high", "2026-06-05"))

    # 9 — weak restricted legs never "pad": the gate returns False (no leg admitted).
    def test_weak_restricted_does_not_pad(self):
        self.assertFalse(po._market_allowed_for_section(self._leg("batter_total_bases", series=self.WEAK), "longshot", "2026-06-05"))

    # 10 — existing reliability gate still works: allowed market eligible everywhere.
    def test_allowed_market_still_eligible(self):
        hits = self._leg("batter_hits", series=self.STRONG)
        for sec in ("low", "medium", "high", "longshot"):
            self.assertTrue(po._market_allowed_for_section(hits, sec, "2026-06-05"), sec)
        self.assertEqual(po.market_suggested_status("nba", "PTS"), "allowed")


if __name__ == "__main__":
    unittest.main()
