"""Tests for `pipeline.audit_signal_policy` (PR #118).

Locks the confirming-days policy contract:
  - Empty audit input → no confirmed signals.
  - 1 day with every rec → only UI-only longshot confirms.
  - 3+ days with the same market weak → market demotion confirmed
    AND the weight multiplier is bounded.
  - Mixed / same-game / DNP all need the configured number of
    confirming days. One bad slate never moves the model.
  - Malformed JSON / unknown rec ID → warning, never crash.
  - Dry-run does not write to disk.
  - Rolling 7-day window picks the NEWEST `window_days` files.

Fixtures are tiny dict shapes — no production JSON is read. The
`build_policy(audits=...)` entry point lets us bypass disk entirely.
"""
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from pipeline.audit_signal_policy import (
    DEFAULT_DAYS_REQUIRED,
    DEFAULT_WINDOW_DAYS,
    WEIGHT_FLOOR,
    build_policy,
    main as cli_main,
)


# ---------------------------------------------------------------------------
# Fixture helpers
# ---------------------------------------------------------------------------


def _audit(
    *,
    date: str,
    rec_ids: list[str],
) -> dict:
    """Minimal audit dict with just the fields the policy reads."""
    return {
        "date": date,
        "recommendations": [
            {"id": rid, "severity": "warn", "message": "..."}
            for rid in rec_ids
        ],
    }


# ---------------------------------------------------------------------------
# Confirming-days contract
# ---------------------------------------------------------------------------


class EmptyInputTests(unittest.TestCase):

    def test_no_audits_yields_no_confirmed_signals(self):
        p = build_policy(audits=[])
        self.assertEqual(p["window"]["daysAvailable"], 0)
        self.assertFalse(p["confirmed"])
        for name, sig in p["signals"].items():
            if name == "marketDemotions":
                self.assertEqual(sig, {})
            else:
                self.assertFalse(
                    sig["confirmed"],
                    f"{name} must not confirm on empty input",
                )

    def test_missing_input_dir_yields_warning_free_empty(self):
        # Pointing at a non-existent directory should be safe — no
        # crash, no warning (just no files).
        p = build_policy(input_dir=Path("/tmp/__gtp_audit_policy_does_not_exist__"))
        self.assertEqual(p["window"]["daysAvailable"], 0)
        self.assertFalse(p["confirmed"])


class OneDayTests(unittest.TestCase):

    def test_one_day_only_longshot_confirms(self):
        """Mirrors the current production state (only 5/25 audit)."""
        audits = [_audit(
            date="2026-05-25",
            rec_ids=[
                "mixed_sport_downrank",
                "samegame_nba_cap_conservative",
                "market_AST_weak",
                "market_REB_weak",
                "longshot_keep_collapsed",
                "dnp_guard_strengthen",
            ],
        )]
        p = build_policy(audits=audits)
        self.assertEqual(p["window"]["daysAvailable"], 1)
        # Top-level confirmed must be False — no model-changing signal
        # may activate on one day, ever.
        self.assertFalse(p["confirmed"])
        # Every model-changing signal: fires=1, NOT confirmed.
        for name in ("mixedSportDownrank", "sameGameNbaCap", "dnpGuardStrengthen"):
            sig = p["signals"][name]
            self.assertEqual(sig["fires"], 1, name)
            self.assertFalse(sig["confirmed"], name)
            self.assertEqual(sig["strength"], 0, name)
        # Market demotions: AST + REB present, fires=1, NOT confirmed,
        # weightMultiplier untouched at 1.0.
        md = p["signals"]["marketDemotions"]
        self.assertIn("AST", md)
        self.assertIn("REB", md)
        for mk in ("AST", "REB"):
            self.assertEqual(md[mk]["fires"], 1)
            self.assertFalse(md[mk]["confirmed"])
            self.assertEqual(md[mk]["weightMultiplier"], 1.0)
        # UI-only longshot confirms with 1 day.
        ls = p["signals"]["longshotKeepCollapsed"]
        self.assertEqual(ls["fires"], 1)
        self.assertTrue(ls["confirmed"], "longshot UI rule confirms at 1 day")


class ConfirmAtThresholdTests(unittest.TestCase):

    def test_three_days_market_weak_confirms_and_demotes(self):
        audits = [
            _audit(date=f"2026-05-2{d}", rec_ids=["market_AST_weak"])
            for d in (3, 4, 5)
        ]
        p = build_policy(audits=audits)
        self.assertTrue(p["confirmed"])
        md = p["signals"]["marketDemotions"]
        self.assertTrue(md["AST"]["confirmed"])
        # 3 fires → 1.0 - 3*0.05 = 0.85
        self.assertAlmostEqual(md["AST"]["weightMultiplier"], 0.85, places=2)

    def test_weight_multiplier_bounded_at_floor(self):
        # 7 days of market_AST_weak in a row — raw multiplier would
        # be 1 - 7*0.05 = 0.65, but FLOOR=0.70 clamps it.
        audits = [
            _audit(date=f"2026-05-{20+i:02d}", rec_ids=["market_AST_weak"])
            for i in range(7)
        ]
        p = build_policy(audits=audits)
        md = p["signals"]["marketDemotions"]
        self.assertEqual(md["AST"]["fires"], 7)
        self.assertTrue(md["AST"]["confirmed"])
        self.assertGreaterEqual(md["AST"]["weightMultiplier"], WEIGHT_FLOOR)
        self.assertEqual(md["AST"]["weightMultiplier"], WEIGHT_FLOOR)

    def test_weight_multiplier_never_above_one(self):
        # Even with 0 fires the multiplier must not exceed 1.0.
        p = build_policy(audits=[_audit(date="2026-05-25", rec_ids=[])])
        for v in p["signals"]["marketDemotions"].values():
            self.assertLessEqual(v["weightMultiplier"], 1.0)

    def test_mixed_sport_needs_days_required(self):
        # 2 days of mixed_sport_downrank → NOT confirmed (threshold 3).
        two = [
            _audit(date=f"2026-05-2{d}", rec_ids=["mixed_sport_downrank"])
            for d in (4, 5)
        ]
        p2 = build_policy(audits=two)
        self.assertFalse(p2["signals"]["mixedSportDownrank"]["confirmed"])
        self.assertFalse(p2["confirmed"])
        # 3 days → confirmed.
        three = [
            _audit(date=f"2026-05-2{d}", rec_ids=["mixed_sport_downrank"])
            for d in (3, 4, 5)
        ]
        p3 = build_policy(audits=three)
        self.assertTrue(p3["signals"]["mixedSportDownrank"]["confirmed"])
        self.assertTrue(p3["confirmed"])

    def test_samegame_nba_needs_days_required(self):
        audits = [
            _audit(date=f"2026-05-2{d}", rec_ids=["samegame_nba_cap_conservative"])
            for d in (3, 4, 5)
        ]
        p = build_policy(audits=audits)
        self.assertTrue(p["signals"]["sameGameNbaCap"]["confirmed"])

    def test_dnp_guard_needs_days_required(self):
        audits = [
            _audit(date=f"2026-05-2{d}", rec_ids=["dnp_guard_strengthen"])
            for d in (3, 4, 5)
        ]
        p = build_policy(audits=audits)
        self.assertTrue(p["signals"]["dnpGuardStrengthen"]["confirmed"])

    def test_longshot_confirms_at_one_day(self):
        p = build_policy(audits=[_audit(
            date="2026-05-25",
            rec_ids=["longshot_keep_collapsed"],
        )])
        self.assertTrue(p["signals"]["longshotKeepCollapsed"]["confirmed"])
        # UI-only — does NOT flip top-level confirmed.
        self.assertFalse(p["confirmed"])


# ---------------------------------------------------------------------------
# Defensive input handling
# ---------------------------------------------------------------------------


class DefensiveTests(unittest.TestCase):

    def test_unknown_rec_id_warns_but_does_not_crash(self):
        audits = [_audit(date="2026-05-25", rec_ids=[
            "market_AST_weak",
            "totally_made_up_signal_v9",
        ])]
        p = build_policy(audits=audits)
        # AST still counted.
        self.assertEqual(p["signals"]["marketDemotions"]["AST"]["fires"], 1)
        # Unknown id produced a warning.
        self.assertTrue(
            any("totally_made_up_signal_v9" in w for w in p["warnings"]),
            f"expected warning for unknown id, got {p['warnings']}",
        )

    def test_malformed_json_file_produces_warning(self):
        with tempfile.TemporaryDirectory() as td:
            tdp = Path(td)
            # One valid file + one corrupt file.
            (tdp / "2026-05-25.json").write_text(json.dumps(_audit(
                date="2026-05-25", rec_ids=["market_AST_weak"],
            )))
            (tdp / "2026-05-26.json").write_text("{ this is not json")
            p = build_policy(input_dir=tdp)
            self.assertEqual(p["window"]["daysAvailable"], 1)
            self.assertTrue(
                any("2026-05-26.json" in w for w in p["warnings"]),
                f"expected malformed-file warning, got {p['warnings']}",
            )

    def test_recommendations_field_missing_handled(self):
        # An audit dict with no `recommendations` field should not
        # crash and should produce no fires.
        audits = [{"date": "2026-05-25"}]
        p = build_policy(audits=audits)
        self.assertEqual(p["window"]["daysAvailable"], 1)
        self.assertFalse(p["confirmed"])

    def test_duplicate_recommendation_in_one_day_counted_once(self):
        # If audit_daily ever emitted the same id twice in one day,
        # we still count it as ONE day of fires (we measure days,
        # not raw recommendation entries).
        audits = [_audit(
            date="2026-05-25",
            rec_ids=["market_AST_weak", "market_AST_weak", "market_AST_weak"],
        )]
        p = build_policy(audits=audits)
        self.assertEqual(p["signals"]["marketDemotions"]["AST"]["fires"], 1)


# ---------------------------------------------------------------------------
# Rolling window
# ---------------------------------------------------------------------------


class WindowTests(unittest.TestCase):

    def test_rolling_window_takes_newest_n(self):
        # Drop 10 audit files; window_days=3 should keep only the
        # 3 newest. Older days must not contribute to fires.
        with tempfile.TemporaryDirectory() as td:
            tdp = Path(td)
            for i in range(10):
                date = f"2026-05-{10+i:02d}"
                # Older days fire the rule; newer days don't.
                fires = ["market_AST_weak"] if i < 5 else []
                (tdp / f"{date}.json").write_text(json.dumps(_audit(
                    date=date, rec_ids=fires,
                )))
            p = build_policy(input_dir=tdp, window_days=3)
            # The newest 3 files are 2026-05-19, 18, 17. None of them
            # fired AST, so policy sees zero fires.
            self.assertEqual(p["window"]["daysAvailable"], 3)
            self.assertNotIn("AST", p["signals"]["marketDemotions"])

    def test_dates_sorted_newest_first(self):
        audits = [
            _audit(date="2026-05-23", rec_ids=[]),
            _audit(date="2026-05-25", rec_ids=[]),
            _audit(date="2026-05-24", rec_ids=[]),
        ]
        p = build_policy(audits=audits)
        self.assertEqual(p["window"]["dates"], ["2026-05-25", "2026-05-24", "2026-05-23"])


# ---------------------------------------------------------------------------
# CLI / dry-run
# ---------------------------------------------------------------------------


class CLITests(unittest.TestCase):

    def test_dry_run_does_not_write_file(self):
        with tempfile.TemporaryDirectory() as td:
            tdp = Path(td)
            (tdp / "2026-05-25.json").write_text(json.dumps(_audit(
                date="2026-05-25", rec_ids=["market_AST_weak"],
            )))
            out = tdp / "policy.json"
            rc = cli_main([
                "--input-dir", str(tdp),
                "--output", str(out),
                "--dry-run",
            ])
            self.assertEqual(rc, 0)
            self.assertFalse(out.exists(), "dry-run must not write the output file")

    def test_real_run_writes_policy_json(self):
        with tempfile.TemporaryDirectory() as td:
            tdp = Path(td)
            (tdp / "2026-05-25.json").write_text(json.dumps(_audit(
                date="2026-05-25", rec_ids=["longshot_keep_collapsed"],
            )))
            out = tdp / "policy.json"
            rc = cli_main([
                "--input-dir", str(tdp),
                "--output", str(out),
            ])
            self.assertEqual(rc, 0)
            self.assertTrue(out.exists())
            written = json.loads(out.read_text())
            self.assertEqual(written["window"]["daysAvailable"], 1)
            self.assertTrue(written["signals"]["longshotKeepCollapsed"]["confirmed"])
            # No model-changing signal is confirmed.
            self.assertFalse(written["confirmed"])


# ---------------------------------------------------------------------------
# Production data sanity check (skips silently if file is missing)
# ---------------------------------------------------------------------------


class ProductionFixtureTests(unittest.TestCase):

    def test_current_production_state_does_not_confirm_model_change(self):
        """Mirrors today's reality (1 audit day on disk): no
        model-changing signal may be confirmed."""
        from pipeline.audit_signal_policy import DEFAULT_INPUT_DIR
        if not DEFAULT_INPUT_DIR.exists() or not list(DEFAULT_INPUT_DIR.glob("*.json")):
            self.skipTest("no on-disk audit files")
        p = build_policy(input_dir=DEFAULT_INPUT_DIR)
        # With ≤2 days, top-level confirmed MUST be False. We don't
        # hard-code 1 here because a real cron may have added 5/26
        # by the time this runs.
        if p["window"]["daysAvailable"] < DEFAULT_DAYS_REQUIRED:
            self.assertFalse(
                p["confirmed"],
                f"top-level confirmed must be False with only "
                f"{p['window']['daysAvailable']} audit day(s)",
            )


if __name__ == "__main__":
    unittest.main()
