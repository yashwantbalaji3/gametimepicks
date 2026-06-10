"""Tests for shared feature-quality / leakage-safety helpers."""
from __future__ import annotations

import unittest
from datetime import datetime, timezone, timedelta

from pipeline.common import feature_quality as fq


class SampleSizeTests(unittest.TestCase):
    def test_buckets(self):
        self.assertEqual(fq.sample_size_bucket(0), "none")
        self.assertEqual(fq.sample_size_bucket(None), "none")
        self.assertEqual(fq.sample_size_bucket(3), "tiny")
        self.assertEqual(fq.sample_size_bucket(10), "small")
        self.assertEqual(fq.sample_size_bucket(20), "moderate")
        self.assertEqual(fq.sample_size_bucket(40), "ample")

    def test_small_sample_weight_monotonic(self):
        self.assertEqual(fq.small_sample_weight(0), 0.0)
        self.assertEqual(fq.small_sample_weight(15, full_weight_at=30), 0.5)
        self.assertEqual(fq.small_sample_weight(30, full_weight_at=30), 1.0)
        self.assertEqual(fq.small_sample_weight(100, full_weight_at=30), 1.0)


class FreshnessTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 6, 10, 12, 0, tzinfo=timezone.utc)

    def test_fresh(self):
        ts = (self.now - timedelta(minutes=10)).isoformat()
        self.assertFalse(fq.is_stale(ts, 30, now=self.now))
        self.assertEqual(fq.freshness_status(ts, 30, now=self.now), "fresh")

    def test_stale(self):
        ts = (self.now - timedelta(minutes=120)).isoformat()
        self.assertTrue(fq.is_stale(ts, 30, now=self.now))
        self.assertEqual(fq.freshness_status(ts, 30, now=self.now), "stale")

    def test_missing_is_stale_and_unknown(self):
        self.assertTrue(fq.is_stale(None, 30, now=self.now))      # fail-closed
        self.assertEqual(fq.freshness_status(None, 30, now=self.now), "unknown")
        self.assertEqual(fq.freshness_status("not-a-date", 30, now=self.now), "unknown")


class MissingFlagTests(unittest.TestCase):
    def test_missing(self):
        self.assertTrue(fq.missing_flag(None))
        self.assertTrue(fq.missing_flag(""))
        self.assertTrue(fq.missing_flag(float("nan")))
        self.assertFalse(fq.missing_flag(0))
        self.assertFalse(fq.missing_flag("x"))

    def test_required_source_status(self):
        now = datetime(2026, 6, 10, 12, 0, tzinfo=timezone.utc)
        ok = fq.required_source_status(0.6, "the_odds_api",
                                       (now - timedelta(minutes=5)).isoformat(), 30, now=now)
        self.assertTrue(ok["present"]); self.assertTrue(ok["usable"])
        missing = fq.required_source_status(None, None, None, 30, now=now)
        self.assertFalse(missing["present"]); self.assertFalse(missing["usable"])
        self.assertIsNotNone(fq.unknown_reason(False, None, "unknown"))
        self.assertIsNone(fq.unknown_reason(True, "src", "fresh"))


class LeakageGuardTests(unittest.TestCase):
    def test_excludes_current_true_when_all_before(self):
        rows = [{"date": "2026-06-07"}, {"date": "2026-06-08"}]
        self.assertTrue(fq.rolling_excludes_current(rows, "2026-06-09"))

    def test_excludes_current_false_when_includes_target(self):
        rows = [{"date": "2026-06-08"}, {"date": "2026-06-09"}]  # target leaks in
        self.assertFalse(fq.rolling_excludes_current(rows, "2026-06-09"))

    def test_excludes_current_false_when_after_target(self):
        rows = [{"date": "2026-06-10"}]
        self.assertFalse(fq.rolling_excludes_current(rows, "2026-06-09"))

    def test_filter_pregame_rows(self):
        rows = [{"date": "2026-06-07"}, {"date": "2026-06-09"}, {"date": "2026-06-10"}]
        kept = fq.filter_pregame_rows(rows, "2026-06-09")
        self.assertEqual([r["date"] for r in kept], ["2026-06-07"])


if __name__ == "__main__":
    unittest.main()
