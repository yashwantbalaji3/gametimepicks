import json
import tempfile
import unittest
from pathlib import Path

from pipeline.world_cup.settle import (
    grade_moneyline,
    grade_total,
    grade_double_chance,
    grade_pick,
    load_official_scores,
    _regulation_goals,
)


class TestSettle(unittest.TestCase):
    def test_moneyline_home_draw_away(self):
        self.assertEqual(grade_moneyline("home", 2, 1), "win")
        self.assertEqual(grade_moneyline("home", 1, 2), "loss")
        self.assertEqual(grade_moneyline("draw", 1, 1), "win")   # Draw is a real outcome
        self.assertEqual(grade_moneyline("away", 0, 1), "win")
        self.assertEqual(grade_moneyline("draw", 2, 1), "loss")

    def test_moneyline_uses_90_minute_final(self):
        # Mexico 2-0 in regulation → Mexico ML (home) wins on the 90' score.
        self.assertEqual(grade_moneyline("home", 2, 0), "win")
        # A 90' draw loses the home moneyline no matter what happens after.
        self.assertEqual(grade_moneyline("home", 1, 1), "loss")

    def test_total_over_under(self):
        self.assertEqual(grade_total("over", 2.5, 2, 1), "win")   # 3 > 2.5
        self.assertEqual(grade_total("under", 2.5, 1, 1), "win")  # 2 < 2.5
        self.assertEqual(grade_total("over", 2.5, 1, 1), "loss")
        self.assertEqual(grade_total("over", 3.0, 2, 1), "push")  # whole line can push

    def test_double_chance_wins_if_either_team_wins_loses_on_draw(self):
        # "Team A or Team B" (home_or_away) — wins if EITHER side wins in 90'...
        self.assertEqual(grade_double_chance("home_or_away", 2, 1), "win")
        self.assertEqual(grade_double_chance("home_or_away", 0, 3), "win")
        # ...and LOSES on a regulation draw (the one uncovered outcome).
        self.assertEqual(grade_double_chance("home_or_away", 1, 1), "loss")
        # home_or_draw / away_or_draw cover the draw instead.
        self.assertEqual(grade_double_chance("home_or_draw", 1, 1), "win")
        self.assertEqual(grade_double_chance("home_or_draw", 0, 1), "loss")
        self.assertEqual(grade_double_chance("away_or_draw", 0, 1), "win")
        self.assertEqual(grade_double_chance("away_or_draw", 2, 0), "loss")
        # Unknown pick formats are never guessed.
        self.assertEqual(grade_double_chance("mystery", 1, 0), "ungradeable")

    def test_grade_pick_dispatch(self):
        self.assertEqual(grade_pick({"market": "moneyline_90", "pick": "home"}, 2, 0), "win")
        self.assertEqual(grade_pick({"market": "double_chance", "pick": "home_or_away"}, 2, 1), "win")
        self.assertEqual(grade_pick({"market": "match_total_goals", "pick": "over", "line": 2.5}, 2, 1), "win")
        # Unsupported markets (e.g. corners without a published grader) are skipped, not guessed.
        self.assertIsNone(grade_pick({"market": "match_total_corners", "pick": "over", "line": 8.5}, 2, 1))

    def test_only_finished_regulation(self):
        self.assertIsNone(_regulation_goals({"fixture": {"status": {"short": "NS"}}, "goals": {"home": 0, "away": 0}}))
        self.assertEqual(_regulation_goals({"fixture": {"status": {"short": "FT"}}, "goals": {"home": 2, "away": 1}}), (2, 1))

    def test_load_official_scores_accepts_only_finished_integer_finals(self):
        doc = {
            "matches": [
                {"matchId": 1, "homeGoals": 2, "awayGoals": 0, "status": "FT"},
                {"matchId": 2, "homeGoals": 1, "awayGoals": 1, "status": "NS"},     # not finished → dropped
                {"matchId": 3, "homeGoals": None, "awayGoals": 0, "status": "FT"},  # malformed → dropped
                {"homeGoals": 1, "awayGoals": 0, "status": "FT"},                    # no matchId → dropped
            ]
        }
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            json.dump(doc, f)
            p = Path(f.name)
        try:
            scores = load_official_scores(p)
            self.assertEqual(set(scores.keys()), {1})
            self.assertEqual((scores[1]["homeGoals"], scores[1]["awayGoals"]), (2, 0))
        finally:
            p.unlink()


if __name__ == "__main__":
    unittest.main()
