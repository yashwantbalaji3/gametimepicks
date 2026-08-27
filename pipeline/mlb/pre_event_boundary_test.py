"""The pre-event boundary: nothing that has already started may enter a current forecast.

Written from a real failure. On 2026-08-27 the daily generation chain never received its scheduled
GitHub events; by the time the slate could be re-run, one of the day's seven games was already in
progress. The generator would have priced and published it exactly like the six that had not started
— `_captured_before_start` existed, but it only decorated a row with a `researchEligible` flag and
gated nothing.

These cases pin the boundary at both layers (event and row), pin the direction it fails in, and pin
the reconciliation that keeps a refused game visible instead of silently absent.
"""

import unittest

from pipeline.mlb import generate_mlb_board as G


AT = "2026-08-27T18:10:00+00:00"


def ev(eid, commence, away="Away Club", home="Home Club"):
    return {"id": eid, "commence_time": commence, "away_team": away, "home_team": home}


class HasStartedTest(unittest.TestCase):
    def test_future_start_is_pregame(self):
        self.assertFalse(G._has_started("2026-08-27T23:05:00Z", at=AT))

    def test_past_start_has_started(self):
        self.assertTrue(G._has_started("2026-08-27T17:05:00Z", at=AT))

    def test_equality_is_not_pregame(self):
        # First pitch is not "before first pitch".
        self.assertTrue(G._has_started("2026-08-27T18:10:00Z", at=AT))

    def test_missing_start_fails_closed(self):
        # We cannot time-check it, so it never enters a pre-event artifact.
        self.assertTrue(G._has_started(None, at=AT))

    def test_unparseable_start_fails_closed(self):
        self.assertTrue(G._has_started("first pitch, sometime", at=AT))

    def test_unparseable_reference_fails_closed(self):
        self.assertTrue(G._has_started("2026-08-27T23:05:00Z", at="not-a-time"))


class PartitionTest(unittest.TestCase):
    def test_splits_on_the_generation_instant(self):
        events = [
            ev("a", "2026-08-27T17:05:00Z"),  # started
            ev("b", "2026-08-27T23:05:00Z"),  # pregame
            ev("c", "2026-08-28T01:45:00Z"),  # pregame
        ]
        pregame, started = G.partition_events_by_start(events, at=AT)
        self.assertEqual([e["id"] for e in pregame], ["b", "c"])
        self.assertEqual([e["id"] for e in started], ["a"])

    def test_partition_is_total(self):
        # Every event lands in exactly one side — none may be dropped on the floor.
        events = [ev(str(i), "2026-08-27T17:05:00Z" if i % 2 else "2026-08-28T01:45:00Z") for i in range(9)]
        pregame, started = G.partition_events_by_start(events, at=AT)
        self.assertEqual(len(pregame) + len(started), len(events))
        self.assertEqual(
            sorted(e["id"] for e in pregame + started), sorted(e["id"] for e in events)
        )

    def test_receipt_types_every_refusal(self):
        _, started = G.partition_events_by_start([ev("a", "2026-08-27T17:05:00Z")], at=AT)
        rows = G._started_receipt(started, at=AT)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["state"], "MISSED_COVERAGE")
        self.assertEqual(rows[0]["reason"], "MISSING_PRE_EVENT_ARTIFACT")
        self.assertEqual(rows[0]["providerEventId"], "a")
        self.assertEqual(rows[0]["commenceTime"], "2026-08-27T17:05:00Z")
        self.assertEqual(rows[0]["generatedAt"], AT)


class CoverageReconciliationTest(unittest.TestCase):
    def _summary(self, started_rows=()):
        return {
            "generatedAt": AT,
            "startedBeforeGeneration": list(started_rows),
            "eventsWithOdds": 0,
        }

    def test_scheduled_partitions_into_pregame_and_started(self):
        games = [
            {"gameDate": "2026-08-27T17:05:00Z"},
            {"gameDate": "2026-08-27T23:05:00Z"},
            {"gameDate": "2026-08-27T23:07:00Z"},
        ]
        cov = G.build_coverage(games, self._summary(), leans=[])
        self.assertEqual(cov["scheduled"], 3)
        self.assertEqual(cov["startedGameCount"], 1)
        self.assertEqual(cov["pregameAtGeneration"], 2)
        self.assertEqual(cov["pregameAtGeneration"] + cov["startedGameCount"], cov["scheduled"])

    def test_a_refused_game_stays_in_the_denominator(self):
        # The whole point: the day is 3 games, not 2, even though only 2 could be covered.
        games = [
            {"gameDate": "2026-08-27T17:05:00Z"},
            {"gameDate": "2026-08-27T23:05:00Z"},
            {"gameDate": "2026-08-27T23:07:00Z"},
        ]
        started = G._started_receipt([ev("a", "2026-08-27T17:05:00Z")], at=AT)
        cov = G.build_coverage(games, self._summary(started), leans=[])
        self.assertEqual(cov["scheduled"], 3)
        self.assertEqual(len(cov["startedBeforeGeneration"]), 1)
        self.assertEqual(cov["startedBeforeGeneration"][0]["state"], "MISSED_COVERAGE")

    def test_a_game_with_no_start_time_is_never_counted_as_covered(self):
        cov = G.build_coverage([{"gameDate": None}], self._summary(), leans=[])
        self.assertEqual(cov["pregameAtGeneration"], 0)
        self.assertEqual(cov["startedGameCount"], 1)


if __name__ == "__main__":
    unittest.main()
