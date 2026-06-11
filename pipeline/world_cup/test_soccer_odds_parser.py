"""Tests for the pure 3-way soccer odds parser — fail-closed guarantees."""
import unittest
from pipeline.world_cup.soccer_odds_parser import (
    american_to_prob, devig_three_way, parse_h2h_3way, parse_totals, build_event_outlook,
)


def bk(key, *, h2h=None, totals=None):
    markets = []
    if h2h is not None:
        markets.append({"key": "h2h", "outcomes": h2h})
    if totals is not None:
        markets.append({"key": "totals", "outcomes": totals})
    return {"key": key, "markets": markets}


class SoccerParserTests(unittest.TestCase):
    def test_devig_three_way_sums_to_one(self):
        ph, pd, pa = american_to_prob(-110), american_to_prob(260), american_to_prob(300)
        dv = devig_three_way(ph, pd, pa)
        self.assertAlmostEqual(sum(dv), 1.0, places=6)
        self.assertGreater(dv[0], dv[2])  # home favorite

    def test_full_3way_parses(self):
        h2h = [{"name": "Mexico", "price": -140}, {"name": "South Africa", "price": 360},
               {"name": "Draw", "price": 260}]
        r = parse_h2h_3way(bk("dk", h2h=h2h), home_team="Mexico", away_team="South Africa")
        self.assertIsNotNone(r)
        self.assertAlmostEqual(r["homeWinPct"] + r["drawPct"] + r["awayWinPct"], 1.0, places=3)
        self.assertEqual(r["market"], "90min_result_3way")

    def test_missing_draw_fails_closed(self):
        h2h = [{"name": "Mexico", "price": -140}, {"name": "South Africa", "price": 360}]
        self.assertIsNone(parse_h2h_3way(bk("dk", h2h=h2h), home_team="Mexico", away_team="South Africa"))

    def test_two_way_does_not_masquerade(self):
        # A 2-way market (no Draw) must never produce a 3-way result.
        h2h = [{"name": "Team A", "price": -200}, {"name": "Team B", "price": 170}]
        out = build_event_outlook({"id": "1", "home_team": "Team A", "away_team": "Team B",
                                   "bookmakers": [bk("dk", h2h=h2h)]})
        self.assertEqual(out["status"], "unavailable_bad_market_shape")
        self.assertNotIn("result", out)

    def test_malformed_odds_fail_closed(self):
        h2h = [{"name": "Mexico", "price": "x"}, {"name": "South Africa", "price": 360},
               {"name": "Draw", "price": 260}]
        self.assertIsNone(parse_h2h_3way(bk("dk", h2h=h2h), home_team="Mexico", away_team="South Africa"))

    def test_totals_devig(self):
        totals = [{"name": "Over", "point": 2.5, "price": -105}, {"name": "Under", "point": 2.5, "price": -115}]
        t = parse_totals(bk("dk", totals=totals))
        self.assertEqual(t["line"], 2.5)
        self.assertAlmostEqual(t["overPct"] + t["underPct"], 1.0, places=4)

    def test_no_odds_unavailable(self):
        out = build_event_outlook({"id": "1", "home_team": "A", "away_team": "B", "bookmakers": []})
        self.assertEqual(out["status"], "unavailable_no_odds")

    def test_ready_with_full_market(self):
        h2h = [{"name": "Mexico", "price": -140}, {"name": "South Africa", "price": 360},
               {"name": "Draw", "price": 260}]
        totals = [{"name": "Over", "point": 2.5, "price": -105}, {"name": "Under", "point": 2.5, "price": -115}]
        out = build_event_outlook({"id": "9", "home_team": "Mexico", "away_team": "South Africa",
                                   "commence_time": "2026-06-11T20:00:00Z",
                                   "bookmakers": [bk("draftkings", h2h=h2h, totals=totals)]})
        self.assertEqual(out["status"], "ready")
        self.assertIn("extra time", out["marketRules"])
        self.assertEqual(out["result"]["drawOdds"], 260)
        self.assertEqual(out["totals"]["line"], 2.5)

    def test_book_preference(self):
        h2h_dk = [{"name": "A", "price": -150}, {"name": "B", "price": 320}, {"name": "Draw", "price": 250}]
        h2h_fd = [{"name": "A", "price": -160}, {"name": "B", "price": 330}, {"name": "Draw", "price": 240}]
        out = build_event_outlook({"id": "1", "home_team": "A", "away_team": "B",
                                   "bookmakers": [bk("fanduel", h2h=h2h_fd), bk("draftkings", h2h=h2h_dk)]})
        # draftkings is the first preferred book present
        self.assertEqual(out["result"]["bookmaker"], "draftkings")


if __name__ == "__main__":
    unittest.main()
