"""Tests for UFC schedule ingestion + card-only odds reconciliation (no network)."""
from __future__ import annotations

import unittest
from pipeline.ufc.build_schedule import build as build_sched
from pipeline.ufc.build_features import build as build_feat

def _sb(comps):
    return {"events": [{"id": "e1", "name": "UFC Test", "date": "2026-06-15T00:00Z",
                        "status": {"type": {"state": "pre"}},
                        "competitions": [{"competitors": [{"athlete": {"displayName": a}},
                                                          {"athlete": {"displayName": b}}],
                                          "type": {"text": "Bout"}} for a, b in comps]}]}

REAL = [("Alex Pereira", "Ciryl Gane"), ("Ilia Topuria", "Justin Gaethje"), ("Bo Nickal", "Kyle Daukaus")]
FUTURES = [("Alex Pereira", "Carlos Ulberg"), ("Alex Pereira", "Jon Jones"), ("Bo Nickal", "Kyle Daukaus")]

FIGHTERS = {"fighters": [{"canonicalName": n, "record": {"wins": 10, "losses": 2, "total": 12},
                          "finishes": {"finishRate": 0.5}, "rates": {"avgSigStrLandedPerRound": 4, "avgTakedownsPerRound": 1, "statRounds": 5},
                          "physicals": {"reachInches": 76, "ageYears": 30}, "recentForm": {"last5": "4-1", "fightCount": 12},
                          "daysSinceLastFight": 120, "dataCompleteness": 1.0}
                         for n in ["Alex Pereira", "Ciryl Gane", "Ilia Topuria", "Justin Gaethje", "Bo Nickal", "Kyle Daukaus", "Carlos Ulberg", "Jon Jones"]]}


class ScheduleTests(unittest.TestCase):
    def test_real_card_parsed(self):
        s = build_sched(_sb(REAL))
        self.assertTrue(s["isRealCard"])
        self.assertEqual(s["fightCount"], 3)

    def test_futures_duplicate_fighter_blocked(self):
        s = build_sched(_sb(FUTURES))  # Pereira appears twice
        # Pereira's two bouts blocked as duplicate; only Nickal/Daukaus stands
        self.assertTrue(any("duplicate fighter" in (b.get("reason", "")) for b in s["blockers"]))
        self.assertFalse(s["isRealCard"])  # duplicate fighter on card → not real


class CardReconcileTests(unittest.TestCase):
    def _odds(self, bouts):
        return {"generatedAt": "2026-06-10T00:00:00+00:00",
                "bouts": [{"fighters": [a, b], "commenceTime": "2026-06-15T00:00:00+00:00",
                           "sides": [{"name": a, "price": -150, "impliedProbability": 0.6},
                                     {"name": b, "price": 130, "impliedProbability": 0.43}]} for a, b in bouts]}

    def test_only_scheduled_bouts_kept(self):
        sched = build_sched(_sb(REAL))
        odds = self._odds(REAL + [("Alex Pereira", "Jon Jones")])  # +1 futures not on card
        feat = build_feat(odds, FIGHTERS, schedule=sched)
        self.assertEqual(feat["matchedFightCount"], 3)
        self.assertTrue(any("not on the real ESPN card" in b["reason"] for b in feat["blocked"]))

    def test_suffix_tolerant_match(self):
        sched = build_sched(_sb([("Steve Garcia", "Diego Lopes")]))
        FS = {"fighters": [{"canonicalName": "Steve Garcia Jr.", "record": {"wins": 5, "losses": 1, "total": 6}, "finishes": {"finishRate": 0.4}, "rates": {"statRounds": 5, "avgSigStrLandedPerRound": 4, "avgTakedownsPerRound": 1}, "physicals": {"reachInches": 70, "ageYears": 28}, "recentForm": {"last5": "3-1", "fightCount": 6}, "daysSinceLastFight": 90, "dataCompleteness": 1.0},
                           {"canonicalName": "Diego Lopes", "record": {"wins": 8, "losses": 2, "total": 10}, "finishes": {"finishRate": 0.6}, "rates": {"statRounds": 5, "avgSigStrLandedPerRound": 5, "avgTakedownsPerRound": 0}, "physicals": {"reachInches": 72, "ageYears": 31}, "recentForm": {"last5": "4-1", "fightCount": 10}, "daysSinceLastFight": 100, "dataCompleteness": 1.0}]}
        odds = self._odds([("Diego Lopes", "Steve Garcia Jr.")])  # odds has Jr.; schedule does not
        feat = build_feat(odds, FS, schedule=sched)
        self.assertEqual(feat["matchedFightCount"], 1)  # suffix-tolerant match succeeds


if __name__ == "__main__":
    unittest.main()
