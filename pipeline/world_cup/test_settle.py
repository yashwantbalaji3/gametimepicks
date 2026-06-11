import unittest
from pipeline.world_cup.settle import grade_moneyline, grade_total, _regulation_goals


class TestSettle(unittest.TestCase):
    def test_moneyline_home_draw_away(self):
        self.assertEqual(grade_moneyline("home", 2, 1), "win")
        self.assertEqual(grade_moneyline("home", 1, 2), "loss")
        self.assertEqual(grade_moneyline("draw", 1, 1), "win")   # Draw is a real outcome
        self.assertEqual(grade_moneyline("away", 0, 1), "win")
        self.assertEqual(grade_moneyline("draw", 2, 1), "loss")

    def test_total_over_under(self):
        self.assertEqual(grade_total("over", 2.5, 2, 1), "win")   # 3 > 2.5
        self.assertEqual(grade_total("under", 2.5, 1, 1), "win")  # 2 < 2.5
        self.assertEqual(grade_total("over", 2.5, 1, 1), "loss")

    def test_only_finished_regulation(self):
        self.assertIsNone(_regulation_goals({"fixture": {"status": {"short": "NS"}}, "goals": {"home": 0, "away": 0}}))
        self.assertEqual(_regulation_goals({"fixture": {"status": {"short": "FT"}}, "goals": {"home": 2, "away": 1}}), (2, 1))
