"""Tests for official UFC V1 artifacts. V1 is LIVE from real data; validation is a
SEPARATE badge (moneylineValidated/parlayValidated) that stays false until thresholds
pass. V1 must never claim validation it lacks, and stays moneyline-only."""
from __future__ import annotations

import unittest
from unittest import mock

from pipeline.ufc import build_v1 as v1


def _proj(rows, event="UFC Test: A vs B"):
    return {"eventName": event, "eventDate": "2026-06-15", "projections": rows}


def _row(f, o, mp, edge=0.0, dq=1.0, futures=False, blockers=None, price=-150):
    return {"boutId": f"b:{f}|{o}", "fighter": f, "opponent": o, "oddsPrice": price,
            "marketImpliedProbability": 0.6, "modelProbability": mp, "modelAdjustment": 0.0,
            "edge": edge, "dataQuality": dq, "isFutures": futures,
            "blockers": blockers or [], "warnings": []}


class V1Tests(unittest.TestCase):
    def _build(self, proj, readiness=None):
        def fake_load(name):
            if name == "projections-internal-card-latest.json":
                return proj
            if name == "readiness-latest.json":
                return readiness or {"backtestReady": False, "parlaySimReady": False}
            if name == "schedule-latest.json":
                return {"eventName": proj.get("eventName"), "eventDate": proj.get("eventDate")}
            return {}
        with mock.patch.object(v1, "_load", fake_load):
            return v1.build()

    def test_v1_publishes_with_backtest_false(self):
        p, c = self._build(_proj([_row("A", "B", 0.7), _row("C", "D", 0.8)]))
        self.assertTrue(p["moneylineV1Ready"])      # live without backtest
        self.assertTrue(c["parlayV1Ready"])

    def test_validation_false_until_thresholds(self):
        p, c = self._build(_proj([_row("A", "B", 0.7), _row("C", "D", 0.8)]),
                           readiness={"backtestReady": False, "parlaySimReady": False})
        self.assertFalse(p["moneylineValidated"])
        self.assertEqual(p["validationStatus"], "in_progress")
        self.assertFalse(c["parlayValidated"])

    def test_validation_flips_when_thresholds_pass(self):
        p, c = self._build(_proj([_row("A", "B", 0.7), _row("C", "D", 0.8)]),
                           readiness={"backtestReady": True, "parlaySimReady": True})
        self.assertTrue(p["moneylineValidated"])
        self.assertEqual(p["validationStatus"], "validated")
        self.assertTrue(c["parlayValidated"])

    def test_props_always_unavailable(self):
        p, _ = self._build(_proj([_row("A", "B", 0.7), _row("C", "D", 0.8)]),
                           readiness={"backtestReady": True, "parlaySimReady": True})
        self.assertFalse(p["propsProviderReady"])
        self.assertFalse(p["methodPropsReady"])
        self.assertFalse(p["distancePropsReady"])
        self.assertFalse(p["roundPropsReady"])
        self.assertEqual(p["marketScope"], "h2h_moneyline_only")

    def test_excludes_futures_blocked_lowdq(self):
        p, _ = self._build(_proj([
            _row("A", "B", 0.7),
            _row("X", "Y", 0.7, futures=True),
            _row("Bad", "C", 0.7, blockers=["ambiguous"]),
            _row("Low", "D", 0.7, dq=0.5)]))
        self.assertEqual({r["fighter"] for r in p["projections"]}, {"A"})

    def test_not_ready_without_event(self):
        with mock.patch.object(v1, "_load", lambda n: {"projections": [_row("A", "B", 0.7)]} if n == "projections-internal-card-latest.json" else {}):
            p, _ = v1.build()
        self.assertFalse(p["moneylineV1Ready"])

    def test_parlays_moneyline_only_no_dupes(self):
        _, c = self._build(_proj([_row("A", "B", 0.84), _row("C", "D", 0.80), _row("E", "F", 0.78)]))
        for card in c["cards"]:
            bouts = [l["boutId"] for l in card["legs"]]
            self.assertEqual(len(bouts), len(set(bouts)))
            for l in card["legs"]:
                self.assertEqual(set(l) - {"fighter", "boutId", "modelProbability"}, set())


if __name__ == "__main__":
    unittest.main()
