"""recent10_extractor supports the expanded NBA markets (3PM/PRA/BLK/STL) so
attach_recent10 populates recent10 and confidence_guardrails (R1) no longer
downgrades them to insufficient_data. A requests stub keeps it dependency-free."""
from __future__ import annotations

import sys, types, unittest
sys.modules.setdefault("requests", types.ModuleType("requests"))

from pipeline.recent10_extractor import (  # noqa: E402
    extract_recent10, extract_recent10_all_markets, SUPPORTED_MARKETS, _market_value,
)
from pipeline.providers.base import GameLog  # noqa: E402


def _logs(n=10):
    return [GameLog(player_id=1, game_date="2026-06-%02d" % (9 - i), opponent_abbr="X",
                    home_away="Home", minutes=30.0, pts=20 - i, reb=5, ast=6,
                    fg3m=3, blk=1, stl=2, tov=4) for i in range(n)]


class Recent10NewMarketsTests(unittest.TestCase):
    def test_supported_includes_new_markets(self):
        for m in ("3PM", "PRA", "BLK", "STL"):
            self.assertIn(m, SUPPORTED_MARKETS)

    def test_extract_new_markets_nonempty(self):
        logs = _logs()
        self.assertEqual(len(extract_recent10(logs, "3PM")), 10)
        self.assertEqual(extract_recent10(logs, "BLK")[0], 1.0)
        self.assertEqual(extract_recent10(logs, "STL")[0], 2.0)

    def test_pra_is_sum(self):
        logs = _logs(3)  # pts 20/19/18, reb 5, ast 6 -> pra 31/30/29
        pra = extract_recent10(logs, "PRA")
        self.assertEqual(sorted(pra), [29.0, 30.0, 31.0])

    def test_market_value_pra_missing_component(self):
        self.assertIsNone(_market_value({"pts": 10, "reb": 5}, "PRA"))  # ast missing
        self.assertEqual(_market_value({"pts": 10, "reb": 5, "ast": 3}, "PRA"), 18.0)

    def test_all_markets_dict_has_new_keys(self):
        am = extract_recent10_all_markets(_logs())
        for m in ("PTS", "REB", "AST", "3PM", "PRA", "BLK", "STL"):
            self.assertIn(m, am)

    def test_pts_reb_ast_unchanged(self):
        logs = _logs()
        self.assertEqual(extract_recent10(logs, "PTS")[-1], 20.0)  # newest
        self.assertEqual(extract_recent10(logs, "REB")[0], 5.0)


if __name__ == "__main__":
    unittest.main()
