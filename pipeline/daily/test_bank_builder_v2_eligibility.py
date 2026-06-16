"""Unit tests for the Bank Builder V2 survival gate. Run: pipeline/.venv/bin/python -m pytest
pipeline/daily/test_bank_builder_v2_eligibility.py  (or unittest)."""
import unittest

from pipeline.daily.bank_builder_v2_eligibility import (
    survival_score, evaluate_pool, ELIGIBLE_THRESHOLD,
)


def wc_double_chance(game="g1", pick="Norway or Draw", team="Norway", prob=0.93, odds=-2500,
                     form="WWDWW"):
    last5 = [{"result": c} for c in form]
    return {
        "sport": "world_cup", "gameId": game, "gameLabel": f"{team} game",
        "market": "double_chance", "marketLabel": "double chance", "pick": pick,
        "homeTeam": team, "awayTeam": "Opponent",
        "homeForm": {"formString": form, "last5": last5}, "awayForm": None,
        "americanOdds": odds, "modelProbability": prob, "dataQuality": "B", "edgePct": 0.1,
    }


def mlb_hitter(player="Some Hitter", prob=0.78, odds=-200, line=0.5, side="Over",
               recent=(1, 1, 0, 2, 1), lineup=None):
    return {
        "sport": "mlb", "gameId": "m1", "gameLabel": "AAA @ BBB",
        "market": "batter_hits", "marketLabel": "hits", "pick": f"{player} {side} {line}",
        "playerName": player, "line": line, "side": side,
        "recentGames": [{"value": v} for v in recent],
        "americanOdds": odds, "modelProbability": prob, "dataQuality": "A",
        **({"lineupStatus": lineup} if lineup else {}),
    }


def mlb_pitcher(prob=0.77, odds=-166, line=5.5, recent=(4, 5, 3, 6), lineup="confirmed"):
    return {
        "sport": "mlb", "gameId": "m2", "gameLabel": "CCC @ DDD",
        "market": "pitcher_strikeouts", "marketLabel": "strikeouts",
        "pick": f"Ace Pitcher Under {line}", "line": line, "side": "Under",
        "recentGames": [{"value": v} for v in recent],
        "americanOdds": odds, "modelProbability": prob, "dataQuality": "A", "lineupStatus": lineup,
    }


class TestSurvivalScore(unittest.TestCase):
    def test_wc_double_chance_favourite_is_eligible(self):
        s = survival_score(wc_double_chance())
        self.assertGreaterEqual(s["survivalScore"], ELIGIBLE_THRESHOLD)
        self.assertTrue(s["eligible"])
        self.assertEqual(s["marketFamily"], "team")
        self.assertEqual(s["penalties"], {})  # team markets carry no volatility/DNP penalty

    def test_mlb_hitter_unconfirmed_lineup_is_rejected(self):
        s = survival_score(mlb_hitter())
        self.assertFalse(s["eligible"])
        self.assertLess(s["survivalScore"], ELIGIBLE_THRESHOLD)
        self.assertIn("dnpLineup", s["penalties"])
        self.assertTrue(any("DNP" in r or "lineup" in r for r in s["rejectionReasons"]))

    def test_model_only_no_form_low_quality_rejected(self):
        leg = wc_double_chance(prob=0.84)
        leg["dataQuality"] = "limited"
        leg["homeForm"] = None
        s = survival_score(leg)
        self.assertFalse(s["eligible"])
        self.assertTrue(any("data quality" in r for r in s["rejectionReasons"]))
        self.assertFalse(s["hitRate"]["available"])  # form not fabricated

    def test_longshot_odds_rejected(self):
        s = survival_score(wc_double_chance(odds=250, prob=0.6))
        self.assertFalse(s["eligible"])
        self.assertTrue(any("longer than" in r for r in s["rejectionReasons"]))

    def test_fragile_over_1_5_hits_rejected(self):
        leg = mlb_hitter(line=1.5, side="Over", recent=(2, 1, 2, 3, 1), lineup="confirmed")
        s = survival_score(leg)
        self.assertFalse(s["eligible"])
        self.assertTrue(any("Over 1.5" in r for r in s["rejectionReasons"]))

    def test_score_is_pure_and_clamped(self):
        leg = wc_double_chance()
        a, b = survival_score(leg), survival_score(leg)
        self.assertEqual(a["survivalScore"], b["survivalScore"])
        self.assertGreaterEqual(a["survivalScore"], 0)
        self.assertLessEqual(a["survivalScore"], 100)

    def test_hit_rate_reported_from_real_games(self):
        s = survival_score(mlb_hitter(recent=(1, 1, 1, 1, 0), lineup="confirmed"))
        self.assertTrue(s["hitRate"]["available"])
        self.assertEqual(s["hitRate"]["hits"], 4)
        self.assertEqual(s["hitRate"]["of"], 5)


class TestEvaluatePool(unittest.TestCase):
    def test_two_games_blocks_launch(self):
        # only two distinct upcoming games (e.g. one fixture already kicked off) → cannot form two
        # differentiated lanes (each needs two legs from different games) → block.
        pool = [
            wc_double_chance(game="g2", pick="Norway or Draw", team="Norway", prob=0.93, odds=-200),
            wc_double_chance(game="g2b", pick="Norway DNB", team="Norway", prob=0.91, odds=-220),
            wc_double_chance(game="g3", pick="Argentina or Draw", team="Argentina", prob=0.92, odds=-200),
            wc_double_chance(game="g3b", pick="Argentina DNB", team="Argentina", prob=0.84, odds=-210),
        ]
        # collapse to two games
        pool[1]["gameId"] = "g2"
        pool[3]["gameId"] = "g3"
        res = evaluate_pool(pool)
        self.assertEqual(res["decision"], "evaluating")
        self.assertLess(res["counts"]["distinctEligibleGames"], 3)
        self.assertIsNone(res["lanes"])

    def test_four_eligible_three_games_launches_with_wc_legs(self):
        # four eligible team legs across three games, priced into the band → launches; each lane has
        # two legs from different games AND at least one World Cup leg, lanes share no leg.
        pool = [
            wc_double_chance(game="g1", pick="France or Draw", team="France", prob=0.86, odds=-200),
            wc_double_chance(game="g2", pick="Norway or Draw", team="Norway", prob=0.84, odds=-190),
            wc_double_chance(game="g3", pick="Argentina or Draw", team="Argentina", prob=0.85, odds=-200),
            wc_double_chance(game="g3b", pick="Argentina DNB", team="Argentina", prob=0.83, odds=-210),
        ]
        pool[3]["gameId"] = "g3"  # second Argentina leg shares g3
        res = evaluate_pool(pool)
        self.assertEqual(res["decision"], "launch")
        self.assertEqual(len(res["lanes"]), 2)
        for lane in res["lanes"]:
            self.assertEqual(len({l["gameId"] for l in lane}), 2, "two different games per lane")
            self.assertTrue(any(l["sport"] == "world_cup" for l in lane), "≥1 World Cup leg per lane")
        # lanes share no leg
        a = {l["pick"] for l in res["lanes"][0]}
        b = {l["pick"] for l in res["lanes"][1]}
        self.assertEqual(a & b, set())

    def test_four_independent_games_prefers_disjoint(self):
        pool = [
            wc_double_chance(game="g1", pick="France or Draw", team="France", prob=0.82, odds=-200),
            wc_double_chance(game="g2", pick="Norway or Draw", team="Norway", prob=0.84, odds=-190),
            wc_double_chance(game="g3", pick="Argentina or Draw", team="Argentina", prob=0.83, odds=-200),
            wc_double_chance(game="g4", pick="Spain or Draw", team="Spain", prob=0.85, odds=-195),
        ]
        res = evaluate_pool(pool)
        self.assertEqual(res["decision"], "launch")
        games_a = {l["gameId"] for l in res["lanes"][0]}
        games_b = {l["gameId"] for l in res["lanes"][1]}
        self.assertEqual(games_a & games_b, set(), "four games → game-disjoint lanes preferred")

    def test_run2_failure_legs_would_not_relaunch(self):
        # the actual Run #2 legs (hitter props, unconfirmed) must all be rejected
        pool = [
            mlb_hitter("Troy Johnston", prob=0.7, odds=-150, recent=(0, 1, 0, 1, 0)),
            mlb_hitter("Mike Trout", prob=0.65, odds=-130, line=1.5, side="Under",
                       recent=(2, 1, 2, 0, 1)),
        ]
        res = evaluate_pool(pool)
        self.assertEqual(res["decision"], "evaluating")
        self.assertEqual(res["counts"]["eligible"], 0)


if __name__ == "__main__":
    unittest.main()
