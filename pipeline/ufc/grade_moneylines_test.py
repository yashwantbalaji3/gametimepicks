"""Tests for build_results + grade_moneylines (fixtures, no network).

Covers the rematch-safe join repair: same-pair/two-date fixtures with OPPOSITE
winners, a committed-artifact regression over the 10 real colliding keys from
the Sprint 044/045 collision audit, and a mutation proof that reintroducing the
date-less pair join (in-memory, source untouched) is caught by the fixtures.
"""
from __future__ import annotations

import json
import unittest
from datetime import datetime, timezone
from pathlib import Path

import pipeline.ufc.grade_moneylines as gm
from pipeline.ufc.build_results import build as build_results
from pipeline.ufc.grade_moneylines import _bout_key, grade

REPO_ROOT = Path(__file__).resolve().parents[2]
COLLISION_AUDIT = REPO_ROOT / "data" / "internal" / "ufc" / "integrity" / "ufc-collision-audit.json"
RESULTS_LATEST = REPO_ROOT / "app" / "public" / "data" / "ufc" / "results-latest.json"

EVENTS = [{"EVENT": "UFC X", "URL": "u", "DATE": "May 16, 2026", "LOCATION": "v"}]
RESULTS = [
    {"EVENT": "UFC X ", "BOUT": "Alex Star vs. Bob Foe", "OUTCOME": "W/L", "WEIGHTCLASS": "MW", "METHOD": "KO/TKO", "ROUND": "1", "TIME": "1:30"},
    {"EVENT": "UFC X ", "BOUT": "Cy Draw vs. Dee Draw", "OUTCOME": "D/D", "WEIGHTCLASS": "LW", "METHOD": "Decision", "ROUND": "3", "TIME": "5:00"},
    {"EVENT": "UFC X ", "BOUT": "Ed NC vs. Fay NC", "OUTCOME": "NC/NC", "WEIGHTCLASS": "LW", "METHOD": "NC", "ROUND": "2", "TIME": "2:00"},
]

# Two meetings of the same pairs on different dates — the rematch shapes that
# broke the date-less join (opposite winners = silent wrong grade).
REMATCH_EVENTS = [
    {"EVENT": "UFC R1", "URL": "u", "DATE": "March 8, 2025", "LOCATION": "v"},
    {"EVENT": "UFC R2", "URL": "u", "DATE": "October 4, 2025", "LOCATION": "v"},
]
REMATCH_RESULTS = [
    # OPPOSITE winners across the two dates (the Pereira/Ankalaev shape)
    {"EVENT": "UFC R1 ", "BOUT": "Rey Champ vs. Mago Rival", "OUTCOME": "W/L", "WEIGHTCLASS": "LHW", "METHOD": "KO/TKO", "ROUND": "1", "TIME": "1:00"},
    {"EVENT": "UFC R2 ", "BOUT": "Rey Champ vs. Mago Rival", "OUTCOME": "L/W", "WEIGHTCLASS": "LHW", "METHOD": "Decision", "ROUND": "5", "TIME": "5:00"},
    # SAME winner both times (the Pereira/Prochazka shape)
    {"EVENT": "UFC R1 ", "BOUT": "Sam Same vs. Tim Twice", "OUTCOME": "W/L", "WEIGHTCLASS": "HW", "METHOD": "KO/TKO", "ROUND": "2", "TIME": "3:00"},
    {"EVENT": "UFC R2 ", "BOUT": "Sam Same vs. Tim Twice", "OUTCOME": "W/L", "WEIGHTCLASS": "HW", "METHOD": "Decision", "ROUND": "3", "TIME": "5:00"},
    # no-contest first meeting, decided rematch
    {"EVENT": "UFC R1 ", "BOUT": "Ned Contest vs. Olly Again", "OUTCOME": "NC/NC", "WEIGHTCLASS": "FW", "METHOD": "NC", "ROUND": "1", "TIME": "2:00"},
    {"EVENT": "UFC R2 ", "BOUT": "Ned Contest vs. Olly Again", "OUTCOME": "W/L", "WEIGHTCLASS": "FW", "METHOD": "Decision", "ROUND": "3", "TIME": "5:00"},
]

DATE1, DATE2 = "2025-03-08", "2025-10-04"


def _results_artifact():
    return build_results({"ufc_event_details": EVENTS, "ufc_fight_results": RESULTS, "ufc_fight_stats": []},
                         since_days=100000, now=datetime(2026, 6, 9, tzinfo=timezone.utc))


def _rematch_artifact():
    return build_results({"ufc_event_details": REMATCH_EVENTS, "ufc_fight_results": REMATCH_RESULTS, "ufc_fight_stats": []},
                         since_days=100000, now=datetime(2026, 6, 9, tzinfo=timezone.utc))


def _bout(a, b, commence):
    bout = {"fighters": [a, b], "sides": [
        {"name": a, "price": -150, "impliedProbability": 0.6},
        {"name": b, "price": 130, "impliedProbability": 0.43}]}
    if commence is not None:
        bout["commenceTime"] = commence
    return bout


def _grade_map(g):
    return {(r["boutId"], r["fighter"]): r["grade"] for r in g["graded"]}


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

    def _odds(self, a, b, commence="2026-05-16T20:00:00Z"):
        return {"generatedAt": "x", "bouts": [_bout(a, b, commence)]}

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


class RematchSafeJoinTests(unittest.TestCase):
    """Same fighter pair, two dates → each bout must grade against ITS OWN date."""

    def setUp(self):
        self.res = _rematch_artifact()
        self.key1 = f"{DATE1}:{_bout_key('Rey Champ', 'Mago Rival')}"
        self.key2 = f"{DATE2}:{_bout_key('Rey Champ', 'Mago Rival')}"

    def test_opposite_winner_rematch_grades_each_date_from_its_own_result(self):
        g = grade({"generatedAt": "x", "bouts": [
            _bout("Rey Champ", "Mago Rival", f"{DATE1}T20:00:00Z"),
            _bout("Rey Champ", "Mago Rival", f"{DATE2}T20:00:00Z")]}, self.res)
        m = _grade_map(g)
        self.assertEqual(m[(self.key1, "Rey Champ")], "win")
        self.assertEqual(m[(self.key1, "Mago Rival")], "loss")
        self.assertEqual(m[(self.key2, "Rey Champ")], "loss")
        self.assertEqual(m[(self.key2, "Mago Rival")], "win")

    def test_same_winner_repeat_bout_decides_both_dates(self):
        g = grade({"generatedAt": "x", "bouts": [
            _bout("Sam Same", "Tim Twice", f"{DATE1}T20:00:00Z"),
            _bout("Sam Same", "Tim Twice", f"{DATE2}T20:00:00Z")]}, self.res)
        m = _grade_map(g)
        for key in (f"{DATE1}:{_bout_key('Sam Same', 'Tim Twice')}",
                    f"{DATE2}:{_bout_key('Sam Same', 'Tim Twice')}"):
            self.assertEqual(m[(key, "Sam Same")], "win")
            self.assertEqual(m[(key, "Tim Twice")], "loss")

    def test_no_contest_first_meeting_voids_only_that_date(self):
        g = grade({"generatedAt": "x", "bouts": [
            _bout("Ned Contest", "Olly Again", f"{DATE1}T20:00:00Z"),
            _bout("Ned Contest", "Olly Again", f"{DATE2}T20:00:00Z")]}, self.res)
        m = _grade_map(g)
        key1 = f"{DATE1}:{_bout_key('Ned Contest', 'Olly Again')}"
        key2 = f"{DATE2}:{_bout_key('Ned Contest', 'Olly Again')}"
        self.assertEqual(m[(key1, "Ned Contest")], "void")
        self.assertEqual(m[(key1, "Olly Again")], "void")
        self.assertEqual(m[(key2, "Ned Contest")], "win")
        self.assertEqual(m[(key2, "Olly Again")], "loss")

    def test_wrong_date_pends_with_explicit_warning_never_picks_a_row(self):
        g = grade({"generatedAt": "x", "bouts": [
            _bout("Rey Champ", "Mago Rival", "2026-01-01T20:00:00Z")]}, self.res)
        for r in g["graded"]:
            self.assertEqual(r["grade"], "pending", r)
            self.assertTrue(r["warnings"], r)
            self.assertIn("other dates", r["warnings"][0])
            self.assertIn("refused", r["warnings"][0])

    def test_missing_commence_time_fails_closed_to_pending(self):
        g = grade({"generatedAt": "x", "bouts": [
            _bout("Rey Champ", "Mago Rival", None)]}, self.res)
        for r in g["graded"]:
            self.assertEqual(r["grade"], "pending", r)
            self.assertIsNone(r["boutId"])
            self.assertIn("cannot derive date-qualified boutId", r["warnings"][0])

    def test_name_normalization_variants_still_match_date_qualified_id(self):
        g = grade({"generatedAt": "x", "bouts": [{
            "fighters": ["  REY   CHAMP  ", "mago rival"],
            "commenceTime": f"{DATE1}T20:00:00Z",
            "sides": [{"name": "  REY   CHAMP  ", "price": -150, "impliedProbability": 0.6},
                      {"name": "mago rival", "price": 130, "impliedProbability": 0.43}]}]}, self.res)
        grades = {r["fighter"]: r["grade"] for r in g["graded"]}
        self.assertEqual(grades["  REY   CHAMP  "], "win")
        self.assertEqual(grades["mago rival"], "loss")

    def test_result_row_missing_bout_id_fails_closed_to_pending(self):
        res = {"generatedAt": "x", "results": [
            {"eventDate": DATE1, "fighterA": "No Id", "fighterB": "Row Here",
             "winner": "No Id", "loser": "Row Here", "resultStatus": "final"}]}
        g = grade({"generatedAt": "x", "bouts": [
            _bout("No Id", "Row Here", f"{DATE1}T20:00:00Z")]}, res)
        self.assertTrue(all(r["grade"] == "pending" for r in g["graded"]))

    def test_ambiguous_bout_id_fails_closed_to_pending(self):
        bid = f"{DATE1}:{_bout_key('Dup A', 'Dup B')}"
        res = {"generatedAt": "x", "results": [
            {"boutId": bid, "eventDate": DATE1, "fighterA": "Dup A", "fighterB": "Dup B",
             "winner": "Dup A", "loser": "Dup B", "resultStatus": "final"},
            {"boutId": bid, "eventDate": DATE1, "fighterA": "Dup A", "fighterB": "Dup B",
             "winner": "Dup B", "loser": "Dup A", "resultStatus": "final"}]}
        g = grade({"generatedAt": "x", "bouts": [
            _bout("Dup A", "Dup B", f"{DATE1}T20:00:00Z")]}, res)
        for r in g["graded"]:
            self.assertEqual(r["grade"], "pending", r)
            self.assertIn("ambiguous boutId", r["warnings"][0])


class CommittedArtifactRegressionTests(unittest.TestCase):
    """The 10 REAL colliding rematch keys (Sprint 044/045 audit) can never
    decide a grade for a bout dated on the wrong date."""

    @classmethod
    def setUpClass(cls):
        if not (COLLISION_AUDIT.exists() and RESULTS_LATEST.exists()):
            raise unittest.SkipTest("committed UFC artifacts not present")
        cls.audit = json.loads(COLLISION_AUDIT.read_text())
        cls.results = json.loads(RESULTS_LATEST.read_text())
        cls.by_pair = {}
        for r in cls.results["results"]:
            cls.by_pair.setdefault(_bout_key(r["fighterA"], r["fighterB"]), r)
        cls.by_id = {r["boutId"]: r for r in cls.results["results"]}

    def test_all_ten_colliding_keys_pend_on_a_wrong_date(self):
        keys = self.audit["collisions"]["collidingKeyList"]
        self.assertEqual(len(keys), 10)
        bouts = []
        for k in keys:
            self.assertNotIn("2026-12-31", k["dates"])
            row = self.by_pair[k["key"]]
            bouts.append(_bout(row["fighterA"], row["fighterB"], "2026-12-31T02:00:00Z"))
        g = grade({"generatedAt": "x", "bouts": bouts}, self.results)
        self.assertEqual(len(g["graded"]), 20)
        for r in g["graded"]:
            self.assertEqual(r["grade"], "pending", r)
            self.assertTrue(r["warnings"], r)  # refusal is explicit, never silent

    def test_right_date_decides_each_colliding_bout_from_its_own_result(self):
        for k in self.audit["collisions"]["collidingKeyList"]:
            for date in k["dates"]:
                row = self.by_id[f"{date}:{k['key']}"]
                g = grade({"generatedAt": "x", "bouts": [
                    _bout(row["fighterA"], row["fighterB"], f"{date}T02:00:00Z")]}, self.results)
                grades = {r["fighter"]: r["grade"] for r in g["graded"]}
                if row["resultStatus"] == "final":
                    self.assertEqual(grades[row["winner"]], "win", row["boutId"])
                    self.assertEqual(grades[row["loser"]], "loss", row["boutId"])
                elif row["resultStatus"] == "no_contest":
                    self.assertTrue(all(v == "void" for v in grades.values()), row["boutId"])
                elif row["resultStatus"] == "draw":
                    self.assertTrue(all(v == "push" for v in grades.values()), row["boutId"])


class MutationProofTests(unittest.TestCase):
    """Reintroduce the date-less pair join IN-MEMORY (source untouched) and
    prove the opposite-winner rematch fixture catches it."""

    def test_dateless_pair_join_fails_the_rematch_fixture(self):
        src_bytes = Path(gm.__file__).read_bytes()
        res = _rematch_artifact()
        odds = {"generatedAt": "x", "bouts": [
            _bout("Rey Champ", "Mago Rival", f"{DATE1}T20:00:00Z"),
            _bout("Rey Champ", "Mago Rival", f"{DATE2}T20:00:00Z")]}
        key1 = f"{DATE1}:{_bout_key('Rey Champ', 'Mago Rival')}"
        key2 = f"{DATE2}:{_bout_key('Rey Champ', 'Mago Rival')}"
        correct = {(key1, "Rey Champ"): "win", (key1, "Mago Rival"): "loss",
                   (key2, "Rey Champ"): "loss", (key2, "Mago Rival"): "win"}

        def _legacy_pair_join(fighters, commence_time, by_id, pair_dates):
            # the pre-repair defect: ANY result sharing the sorted fighter-pair
            # key decides; date ignored; last-write-wins
            pair = gm._bout_key(fighters[0], fighters[1])
            picked = None
            for rows in by_id.values():
                for r in rows:
                    if gm._bout_key(r.get("fighterA", ""), r.get("fighterB", "")) == pair:
                        picked = r
            return picked, []

        original = gm._match_result
        gm._match_result = _legacy_pair_join
        try:
            mutated = _grade_map(gm.grade(odds, res))
        finally:
            gm._match_result = original

        # the mutant collapses both meetings onto ONE result row → at least one
        # decided grade contradicts the true per-date outcome
        self.assertNotEqual(mutated, correct)
        wrong = [k for k, v in correct.items() if mutated.get(k) not in (None, v)]
        self.assertTrue(wrong, f"mutant produced no wrong decided grade: {mutated}")

        # restoration proof: repaired join grades correctly again; source file
        # is byte-identical (mutation lived only in memory)
        self.assertIs(gm._match_result, original)
        self.assertEqual(_grade_map(gm.grade(odds, res)), correct)
        self.assertEqual(Path(gm.__file__).read_bytes(), src_bytes)


if __name__ == "__main__":
    unittest.main()
