"""Stage 4C groundwork: a leg's odds-capture instant is carried verbatim from the source board row, and is
None (never a substitute) when the row has none. No price-age rule is applied here."""
from __future__ import annotations

import unittest

from pipeline.parlay_optimizer import normalize_lean, _iso_or_none
from pipeline.snapshot_optimizer import _leg_to_payload

RAW = {
    "id": "x-batter_hits-0.5", "gameId": "g1", "playerId": 1, "playerName": "A Player", "market": "batter_hits",
    "lean": "Over", "line": 0.5, "oddsOver": -150, "oddsUnder": 120, "bookmaker": "draftkings",
    "commenceTime": "2026-10-06T22:00:00Z", "capturedAt": "2026-10-06T09:27:37Z",
}


class CapturedAtTest(unittest.TestCase):
    def test_carried_verbatim_into_the_leg_and_payload(self):
        leg = normalize_lean(RAW, sport="mlb")
        self.assertEqual(leg.capturedAt, "2026-10-06T09:27:37Z")
        self.assertEqual(_leg_to_payload(leg)["capturedAt"], "2026-10-06T09:27:37Z")

    def test_missing_or_unparseable_is_none_never_a_substitute(self):
        for v in (None, "", "   ", "8:30 PM ET", 1759742857):
            self.assertIsNone(normalize_lean({**RAW, "capturedAt": v}, sport="mlb").capturedAt, repr(v))
        no_field = {k: v for k, v in RAW.items() if k != "capturedAt"}
        self.assertIsNone(_leg_to_payload(normalize_lean(no_field, sport="mlb"))["capturedAt"])

    def test_iso_helper(self):
        self.assertEqual(_iso_or_none("2026-10-06T09:27:37+00:00"), "2026-10-06T09:27:37+00:00")
        self.assertIsNone(_iso_or_none("not a time"))


if __name__ == "__main__":
    unittest.main()
