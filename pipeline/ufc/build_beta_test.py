"""Tests for UFC public BETA artifacts. Beta is real-data, clearly-unvalidated
output that must NOT flip official gates and must stay moneyline-only."""
from __future__ import annotations

import unittest
from unittest import mock

from pipeline.ufc import build_beta as bb


def _proj(rows, event="UFC Test: A vs B"):
    return {"eventName": event, "eventDate": "2026-06-15", "projections": rows}


def _row(f, o, mp, edge=0.0, dq=1.0, futures=False, blockers=None, price=-150):
    return {"boutId": f"b:{f}|{o}", "fighter": f, "opponent": o, "oddsPrice": price,
            "marketImpliedProbability": 0.6, "modelProbability": mp, "modelAdjustment": 0.0,
            "edge": edge, "dataQuality": dq, "isFutures": futures,
            "blockers": blockers or [], "warnings": []}


class BetaTests(unittest.TestCase):
    def _build(self, proj, readiness=None):
        def fake_load(name):
            if name == "projections-internal-card-latest.json":
                return proj
            if name == "readiness-latest.json":
                return readiness or {"backtestReady": False}
            if name == "schedule-latest.json":
                return {"eventName": proj.get("eventName"), "eventDate": proj.get("eventDate")}
            return {}
        with mock.patch.object(bb, "_load", fake_load):
            return bb.build()

    def test_officially_validated_always_false(self):
        # even if (hypothetically) backtest were true, beta artifact stays "not official"
        p, c = self._build(_proj([_row("A", "B", 0.7), _row("C", "D", 0.8)]),
                           readiness={"backtestReady": True})
        self.assertFalse(p["officiallyValidated"])
        self.assertFalse(c["officiallyValidated"])

    def test_excludes_futures(self):
        p, _ = self._build(_proj([_row("A", "B", 0.7), _row("X", "Y", 0.7, futures=True)]))
        names = {r["fighter"] for r in p["projections"]}
        self.assertIn("A", names); self.assertNotIn("X", names)

    def test_excludes_blocked_and_low_quality(self):
        p, _ = self._build(_proj([
            _row("A", "B", 0.7),
            _row("Bad", "C", 0.7, blockers=["ambiguous"]),
            _row("Low", "D", 0.7, dq=0.5)]))
        names = {r["fighter"] for r in p["projections"]}
        self.assertEqual(names, {"A"})

    def test_eligible_when_real_card_rows(self):
        p, _ = self._build(_proj([_row("A", "B", 0.7), _row("C", "D", 0.66)]))
        self.assertTrue(p["betaProjectionsEligible"])
        self.assertEqual(p["marketScope"], "h2h_moneyline_only")

    def test_not_eligible_without_event(self):
        with mock.patch.object(bb, "_load", lambda n: {"projections": [_row("A", "B", 0.7)]} if n == "projections-internal-card-latest.json" else {}):
            p, _ = bb.build()
        self.assertFalse(p["betaProjectionsEligible"])

    def test_parlays_moneyline_only_no_same_fight_dupes(self):
        _, c = self._build(_proj([_row("A", "B", 0.84), _row("C", "D", 0.80), _row("E", "F", 0.78)]))
        self.assertTrue(c["betaParlaysEligible"])
        for card in c["cards"]:
            bouts = [l["boutId"] for l in card["legs"]]
            self.assertEqual(len(bouts), len(set(bouts)))  # no dup fights
            # moneyline-only: legs carry no method/distance/round keys
            for l in card["legs"]:
                self.assertEqual(set(l) - {"fighter", "boutId", "modelProbability"}, set())

    def test_no_parlays_when_no_strong_favorites(self):
        _, c = self._build(_proj([_row("A", "B", 0.55), _row("C", "D", 0.52)]))
        self.assertFalse(c["betaParlaysEligible"])
        self.assertTrue(c["blockers"])


if __name__ == "__main__":
    unittest.main()
