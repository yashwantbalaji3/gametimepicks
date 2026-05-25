"""Tests for the optimizer grader.

Locks the parlay hit-rate definitions:
  - Win iff every leg is win.
  - Loss iff any leg is loss.
  - Push iff at least one push, no losses, no unresolved.
  - Pending iff at least one unresolved, no losses.
  - Pushes excluded from hit-rate denominator.
  - Pending excluded from hit-rate denominator.
  - hit_rate = wins / (wins + losses) per profile / sport / date.
"""
from __future__ import annotations

import unittest

from pipeline.grade_optimizer import (
    _accumulate,
    _empty_acc,
    _finalize,
    grade_optimizer_payload,
)


class HitRateMathTests(unittest.TestCase):

    def test_finalize_computes_hit_rate(self):
        acc = _empty_acc()
        for s in ("win", "win", "loss"):
            _accumulate(acc, s)
        out = _finalize(acc)
        self.assertEqual(out["wins"], 2)
        self.assertEqual(out["losses"], 1)
        self.assertEqual(out["decisive"], 3)
        self.assertAlmostEqual(out["hitRate"], 2 / 3)

    def test_pushes_excluded_from_denominator(self):
        acc = _empty_acc()
        for s in ("win", "loss", "push"):
            _accumulate(acc, s)
        out = _finalize(acc)
        self.assertEqual(out["decisive"], 2)
        self.assertEqual(out["pushes"], 1)
        self.assertAlmostEqual(out["hitRate"], 0.5)

    def test_pending_excluded_from_denominator(self):
        acc = _empty_acc()
        for s in ("win", "pending", "pending"):
            _accumulate(acc, s)
        out = _finalize(acc)
        self.assertEqual(out["decisive"], 1)
        self.assertEqual(out["pending"], 2)
        self.assertAlmostEqual(out["hitRate"], 1.0)

    def test_no_decisive_returns_none_hit_rate(self):
        acc = _empty_acc()
        for s in ("pending", "pending"):
            _accumulate(acc, s)
        out = _finalize(acc)
        self.assertIsNone(out["hitRate"])


def _mk_payload(slips: list[dict]) -> dict:
    """Build a minimal optimizer-snapshot-shaped payload with the
    given slips placed under conservative/all and conservative/mlb so
    we can verify dedup."""
    buckets = {
        "conservative": {
            "nba": [],
            "mlb": list(slips),
            "multi": [],
            "all": list(slips),  # same slipIds — should dedup
        },
        "balanced": {"nba": [], "mlb": [], "multi": [], "all": []},
        "aggressive": {"nba": [], "mlb": [], "multi": [], "all": []},
    }
    return {
        "date": "2099-01-01",  # date with no settled rows → all pending
        "totalSlips": sum(len(s) for b in buckets.values() for s in b.values()),
        "buckets": buckets,
    }


def _mk_slip(slip_id: str, legs: list[dict], profile: str = "conservative",
             sport: str = "mlb") -> dict:
    return {
        "slipId": slip_id,
        "profile": profile,
        "sport": sport,
        "legs": legs,
        "sameGame": False,
        "hasAnomalyLeg": False,
    }


class GradeOptimizerPayloadTests(unittest.TestCase):

    def test_unresolved_legs_make_slip_pending(self):
        slip = _mk_slip("s1", [
            {"playerId": 1, "market": "REB", "side": "Over", "line": 5.5, "sport": "nba"},
        ])
        payload = _mk_payload([slip])
        graded = grade_optimizer_payload(payload)
        # Slip appears in buckets BUT uniqueSlips dedupes — verify dedup.
        self.assertEqual(len(graded["uniqueSlips"]), 1)
        self.assertEqual(graded["uniqueSlips"][0]["status"], "pending")
        # Each leg should be marked unresolved.
        for leg in graded["uniqueSlips"][0]["legs"]:
            self.assertEqual(leg["result"], "unresolved")

    def test_dedup_across_buckets(self):
        # Same slip in two buckets — only count once in uniqueSlips.
        slip = _mk_slip("dup", [
            {"playerId": 1, "market": "REB", "side": "Over", "line": 5.5, "sport": "nba"},
        ])
        payload = _mk_payload([slip])
        graded = grade_optimizer_payload(payload)
        self.assertEqual(len(graded["uniqueSlips"]), 1)
        # Both buckets still reference the slip.
        self.assertEqual(len(graded["buckets"]["conservative"]["mlb"]), 1)
        self.assertEqual(len(graded["buckets"]["conservative"]["all"]), 1)

    def test_empty_payload(self):
        payload = {
            "date": "2099-01-01",
            "totalSlips": 0,
            "buckets": {p: {s: [] for s in ("nba", "mlb", "multi", "all")}
                        for p in ("conservative", "balanced", "aggressive")},
        }
        graded = grade_optimizer_payload(payload)
        self.assertEqual(graded["uniqueSlips"], [])


if __name__ == "__main__":
    unittest.main()
