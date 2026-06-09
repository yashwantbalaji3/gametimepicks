"""Tests for build_results + grade_moneylines (fixtures, no network)."""
from __future__ import annotations

import unittest
from pipeline.ufc.build_results import build as build_results
from pipeline.ufc.grade_moneylines import grade

EVENTS = [{"EVENT": "UFC X", "URL": "u", "DATE": "May 16, 2026", "LOCATION": "v"}]
RESULTS = [
    {"EVENT": "UFC X ", "BOUT": "Alex Star vs. Bob Foe", "OUTCOME": "W/L", "WEIGHTCLASS": "MW", "METHOD": "KO/TKO", "ROUND": "1", "TIME": "1:30"},
    {"EVENT": "UFC X ", "BOUT": "Cy Draw vs. Dee Draw", "OUTCOME": "D/D", "WEIGHTCLASS": "LW", "METHOD": "Decision", "ROUND": "3", "TIME": "5:00"},
    {"EVENT": "UFC X ", "BOUT": "Ed NC vs. Fay NC", "OUTCOME": "NC/NC", "WEIGHTCLASS": "LW", "METHOD": "NC", "ROUND": "2", "TIME": "2:00"},
]


def _results_artifact():
    from datetime import datetime, timezone
    return build_results({"ufc_event_details": EVENTS, "ufc_fight_results": RESULTS, "ufc_fight_stats": []},
                         since_days=100000, now=datetime(2026, 6, 9, tzinfo=timezone.utc))


class BuildResultsTests(unittest.TestCase):
    def test_parses_final_draw_nc(self):
        a = _results_artifact()
        self.assertEqual(a["finalBoutCount"], 1)
        self.assertEqual(a["drawCount"], 1)
        self.assertEqual(a["noContestCount"], 1)
        win = [r for r in a["results"] if r["resultStatus"] == "final"][0]
        self.assertEqual(win["winner"], "Alex Star")
        self.assertEqual(win["loser"], "Bob Foe")

    def test_attribution(self):
        self.assertEqual(_results_artifact()["sourceLicense"], "GPL-3.0")


class GradeMoneylinesTests(unittest.TestCase):
    def setUp(self):
        self.res = _results_artifact()

    def _odds(self, a, b):
        return {"generatedAt": "x", "bouts": [{"fighters": [a, b], "sides": [
            {"name": a, "price": -150, "impliedProbability": 0.6},
            {"name": b, "price": 130, "impliedProbability": 0.43}]}]}

    def test_grades_win_and_loss(self):
        g = grade(self._odds("Alex Star", "Bob Foe"), self.res)
        grades = {r["fighter"]: r["grade"] for r in g["graded"]}
        self.assertEqual(grades["Alex Star"], "win")
        self.assertEqual(grades["Bob Foe"], "loss")

    def test_pending_when_no_result(self):
        g = grade(self._odds("Future A", "Future B"), self.res)
        self.assertTrue(all(r["grade"] == "pending" for r in g["graded"]))

    def test_no_contest_voids(self):
        g = grade(self._odds("Ed NC", "Fay NC"), self.res)
        self.assertTrue(all(r["grade"] == "void" for r in g["graded"]))

    def test_draw_pushes(self):
        g = grade(self._odds("Cy Draw", "Dee Draw"), self.res)
        self.assertTrue(all(r["grade"] == "push" for r in g["graded"]))


if __name__ == "__main__":
    unittest.main()
