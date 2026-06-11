import unittest
from pipeline.world_cup.market_availability import (
    build_availability, REQUESTED_MARKETS,
    STATUS_LIVE, STATUS_RESEARCH, STATUS_WAITING_ODDS, STATUS_WAITING_LINEUPS,
    STATUS_WAITING_FEATURES, STATUS_UNAVAILABLE, STATUS_WAITING_EDGE,
)


class TestMarketAvailability(unittest.TestCase):
    def test_all_requested_markets_present(self):
        keys = {m["key"] for m in REQUESTED_MARKETS}
        self.assertEqual(keys, {
            "moneyline_90", "match_total_goals", "match_total_corners",
            "player_total_shots", "player_shots_on_target", "player_assists", "anytime_goalscorer",
        })

    def test_no_market_silently_missing(self):
        out = build_availability({})  # empty probe → every market still gets a status
        self.assertEqual(set(out["markets"].keys()), {m["key"] for m in REQUESTED_MARKETS})
        for v in out["markets"].values():
            self.assertTrue(v["status"])
            self.assertTrue(v["reason"])

    def test_corners_gated_without_odds(self):
        out = build_availability({"match_total_corners": {"oddsSupported": False, "dataReady": True}})
        self.assertEqual(out["markets"]["match_total_corners"]["status"], STATUS_UNAVAILABLE)
        self.assertFalse(out["markets"]["match_total_corners"]["projectionReady"])

    def test_player_market_waits_on_lineups_even_with_odds(self):
        out = build_availability({"player_shots_on_target":
                                  {"oddsSupported": True, "oddsReady": True, "dataReady": True, "lineupsReady": False}})
        self.assertEqual(out["markets"]["player_shots_on_target"]["status"], STATUS_WAITING_LINEUPS)

    def test_player_gated_without_player_odds(self):
        out = build_availability({"player_assists": {"oddsSupported": False}})
        self.assertEqual(out["markets"]["player_assists"]["status"], STATUS_UNAVAILABLE)

    def test_team_market_research_when_model_ran_below_threshold(self):
        out = build_availability({"moneyline_90":
                                  {"oddsSupported": True, "oddsReady": True, "dataReady": True, "research": True}})
        self.assertEqual(out["markets"]["moneyline_90"]["status"], STATUS_RESEARCH)

    def test_team_market_live_when_active(self):
        out = build_availability({"match_total_goals":
                                  {"oddsSupported": True, "oddsReady": True, "dataReady": True, "active": True}})
        self.assertEqual(out["markets"]["match_total_goals"]["status"], STATUS_LIVE)
        self.assertTrue(out["markets"]["match_total_goals"]["projectionReady"])

    def test_waiting_on_edge_when_ready_but_no_projection(self):
        out = build_availability({"moneyline_90":
                                  {"oddsSupported": True, "oddsReady": True, "dataReady": True}})
        self.assertEqual(out["markets"]["moneyline_90"]["status"], STATUS_WAITING_EDGE)
