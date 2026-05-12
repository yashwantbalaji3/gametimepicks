"""
PR 8 — confidence_guardrails behavior with trends_pending.

Ensures R1 (no_logs_insufficient_data) leaves trends_pending UNCHANGED.
trends_pending is a deliberate "deferred fetch" state, not a "tried &
failed" state, so R1 must not downgrade it.

Also includes regression tests confirming R1/R2/R3/R4 still work as
expected for non-trends_pending leans.
"""
from __future__ import annotations

import unittest

from pipeline.confidence_guardrails import downgrade_lean


def _make_lean(**overrides) -> dict:
    base = {
        "id": "test-lean",
        "playerId": 12345,
        "playerName": "Test Player",
        "market": "PTS",
        "line": 20.5,
        "lean": "Pass",
        "confidence": "trends_pending",
        "edgePct": None,
        "projection": None,
        "recent10": [],  # empty: triggers R1's n_logs == 0 path
    }
    base.update(overrides)
    return base


class TrendsPendingPreservationTests(unittest.TestCase):
    def test_r1_preserves_trends_pending_with_empty_recent10(self) -> None:
        out = downgrade_lean(_make_lean())
        self.assertEqual(out["confidence"], "trends_pending")
        self.assertEqual(out["lean"], "Pass")
        self.assertNotIn("_guardrail", out)
        self.assertNotIn("_originalConfidence", out)

    def test_r1_preserves_trends_pending_with_no_recent10_field(self) -> None:
        lean = _make_lean()
        del lean["recent10"]
        out = downgrade_lean(lean)
        self.assertEqual(out["confidence"], "trends_pending")
        self.assertNotIn("_guardrail", out)

    def test_r1_preserves_trends_pending_even_with_logs(self) -> None:
        # Unusual but possible — trends_pending with logs attached should
        # still stay trends_pending until the next full generate_daily_board.
        out = downgrade_lean(_make_lean(recent10=[10.0, 12.0, 8.0, 15.0, 11.0, 9.0]))
        self.assertEqual(out["confidence"], "trends_pending")
        self.assertNotIn("_guardrail", out)


class RegressionTests(unittest.TestCase):
    """Confirm existing R1/R3/R4 behavior is unchanged for non-trends_pending."""

    def test_r1_still_downgrades_high_with_empty_logs(self) -> None:
        out = downgrade_lean(_make_lean(confidence="High", lean="Over",
                                         edgePct=5.0, recent10=[]))
        self.assertEqual(out["confidence"], "insufficient_data")
        self.assertEqual(out["lean"], "No Play")
        self.assertEqual(out["_guardrail"], "R1_no_logs_insufficient_data")

    def test_r4_caps_high_at_low_with_lt_5_logs(self) -> None:
        out = downgrade_lean(_make_lean(confidence="High", lean="Over",
                                         edgePct=5.0, recent10=[10.0, 12.0, 8.0]))
        self.assertEqual(out["confidence"], "Low")
        self.assertEqual(out["_guardrail"], "R4_thin_sample_capped_low")


if __name__ == "__main__":
    unittest.main()
