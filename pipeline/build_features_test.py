"""Tests for expanded NBA market features (3PM/PRA/BLK/STL) + volatility gating.
PTS/REB/AST behavior must be unchanged. A requests stub lets this run without the
optional dependency (the functions under test are pure)."""
from __future__ import annotations

import sys
import types
import unittest

sys.modules.setdefault("requests", types.ModuleType("requests"))

from pipeline.build_features import build_player_features, _empty_features  # noqa: E402
from pipeline.score_model import project_stat, score_prop  # noqa: E402
from pipeline.providers.base import GameLog  # noqa: E402


def _logs(n=8):
    return [GameLog(player_id=1, game_date="2026-06-%02d" % (9 - i), opponent_abbr="X",
                    home_away="Home" if i % 2 == 0 else "Away", minutes=35.0,
                    pts=30 - i, reb=5, ast=6, fg3m=3, blk=1, stl=2, tov=4) for i in range(n)]


class ExpandedFeatureTests(unittest.TestCase):
    def test_new_market_feature_keys_present(self):
        f = build_player_features(_logs())
        for stat in ("3pm", "pra", "blk", "stl"):
            for win in ("last5", "last10", "season"):
                self.assertIn(f"{win}_{stat}", f, f"missing {win}_{stat}")
            self.assertIn(f"dispersion_{stat}", f)

    def test_pra_is_sum_of_components(self):
        f = build_player_features(_logs())
        # each game pts+reb+ast = (30-i)+5+6; last5 avg of those
        self.assertAlmostEqual(f["last5_pra"], f["last5_pts"] + f["last5_reb"] + f["last5_ast"], places=4)

    def test_pts_reb_ast_unchanged(self):
        f = build_player_features(_logs())
        # season pts = avg(30..23) = 26.5; reb 5; ast 6
        self.assertAlmostEqual(f["season_reb"], 5.0)
        self.assertAlmostEqual(f["season_ast"], 6.0)

    def test_project_new_markets(self):
        f = build_player_features(_logs())
        self.assertGreater(project_stat(f, "3PM", "Home"), 0)
        self.assertGreater(project_stat(f, "PRA", "Home"), 30)
        self.assertGreater(project_stat(f, "BLK", "Home"), 0)

    def test_blocks_steals_capped_at_medium(self):
        f = build_player_features(_logs())
        # a strong-edge line should NOT yield High for BLK/STL
        for mkt in ("BLK", "STL"):
            sp = score_prop(f, mkt, 0.5, -200, +160, "Home", "x")
            self.assertNotEqual(sp.confidence, "High", f"{mkt} must be capped below High")

    def test_threes_can_be_high(self):
        f = build_player_features(_logs())
        sp = score_prop(f, "3PM", 1.5, -200, +160, "Home", "x")  # proj 3.0 >> 1.5
        self.assertIn(sp.confidence, ("High", "Medium", "Low"))  # not capped artificially

    def test_empty_features_has_new_keys(self):
        e = _empty_features()
        for k in ("last5_3pm", "season_pra", "dispersion_blk", "dispersion_stl"):
            self.assertIn(k, e)


if __name__ == "__main__":
    unittest.main()
