"""Guards for the NBA settlement foundation (gate G4).

The whitelist expansion is the easy half. What this file is really for is the two ways it could go
wrong: restamping the historical corpus, and writing graded rows without a lineage the result can be
reconstructed from. Both are asserted against the REAL settled corpus, read-only.
"""
from __future__ import annotations

import json
import sys
import types
import unittest
from collections import Counter, defaultdict
from pathlib import Path

sys.modules.setdefault("requests", types.ModuleType("requests"))

from pipeline.nba import settle_results as nba  # noqa: E402
import pipeline.mlb.settlement_lineage as sl  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SETTLED_PATH = ROOT / "pipeline" / "validation" / "settled_leans.jsonl"

# Measured from the committed corpus on 2026-07-30 and restated in
# docs/NBA_RESEARCH_ADAPTER_READINESS.md: 903 of 4,592 rows invalid, entirely from the four families
# the legacy whitelist short-circuited.
HISTORICAL_INVALID_ROWS = 903
HISTORICAL_TOTAL_ROWS = 4592
SHORT_CIRCUITED_FAMILIES = ("3PM", "STL", "BLK", "PRA")


def read_settled() -> list[dict]:
    rows = []
    for line in SETTLED_PATH.read_text().splitlines():
        line = line.strip()
        if line:
            rows.append(json.loads(line))
    return rows


class MarketVocabularyTests(unittest.TestCase):
    def test_expanded_whitelist_covers_the_short_circuited_families(self):
        for market in SHORT_CIRCUITED_FAMILIES:
            self.assertIn(market, nba.SUPPORTED_MARKETS)

    def test_historical_dates_resolve_to_the_legacy_whitelist(self):
        for date in ("2026-05-15", "2026-06-13", "2026-07-29"):
            self.assertEqual(nba.supported_markets_for_date(date), nba.LEGACY_SUPPORTED_MARKETS)

    def test_expansion_applies_from_its_effective_date_onward(self):
        self.assertEqual(
            nba.supported_markets_for_date(nba.EXPANDED_MARKETS_EFFECTIVE_FROM),
            nba.SUPPORTED_MARKETS,
        )
        self.assertEqual(nba.supported_markets_for_date("2026-10-21"), nba.SUPPORTED_MARKETS)

    def test_missing_date_fails_closed_to_the_legacy_whitelist(self):
        self.assertEqual(nba.supported_markets_for_date(None), nba.LEGACY_SUPPORTED_MARKETS)
        self.assertEqual(nba.supported_markets_for_date(""), nba.LEGACY_SUPPORTED_MARKETS)


class BoxScoreFieldMapTests(unittest.TestCase):
    ESPN_KEYS = [
        "minutes",
        "fieldGoalsMade-fieldGoalsAttempted",
        "threePointFieldGoalsMade-threePointFieldGoalsAttempted",
        "freeThrowsMade-freeThrowsAttempted",
        "offensiveRebounds",
        "defensiveRebounds",
        "rebounds",
        "assists",
        "steals",
        "blocks",
        "turnovers",
        "fouls",
        "plusMinus",
        "points",
    ]
    ESPN_ROW = ["34", "9-17", "4-9", "3-3", "1", "6", "7", "5", "2", "1", "3", "2", "+8", "25"]

    def test_espn_reads_every_family_including_the_combined_three_point_cell(self):
        stats = nba.extract_espn_stats(self.ESPN_ROW, nba.espn_stat_readers(self.ESPN_KEYS))
        self.assertEqual(stats["PTS"], 25.0)
        self.assertEqual(stats["REB"], 7.0)
        self.assertEqual(stats["AST"], 5.0)
        self.assertEqual(stats["STL"], 2.0)
        self.assertEqual(stats["BLK"], 1.0)
        # "4-9" is made-attempted; reading it as a scalar yields nothing, reading the wrong side
        # yields the attempts. Both are silent errors a settled row would carry as a number.
        self.assertEqual(stats["3PM"], 4.0)

    def test_pra_is_the_sum_of_its_three_components(self):
        stats = nba.extract_espn_stats(self.ESPN_ROW, nba.espn_stat_readers(self.ESPN_KEYS))
        self.assertEqual(stats["PRA"], 37.0)

    def test_pra_is_absent_when_any_component_is(self):
        keys = ["rebounds", "assists"]
        stats = nba.extract_espn_stats(["7", "5"], nba.espn_stat_readers(keys))
        self.assertNotIn("PRA", stats)
        self.assertNotIn("PTS", stats)

    def test_absent_column_is_missing_not_zero(self):
        keys = ["points", "rebounds", "assists"]
        stats = nba.extract_espn_stats(["25", "7", "5"], nba.espn_stat_readers(keys))
        self.assertNotIn("BLK", stats)
        self.assertNotIn("3PM", stats)

    def test_short_stat_row_does_not_read_past_its_end(self):
        stats = nba.extract_espn_stats(["25"], nba.espn_stat_readers(self.ESPN_KEYS))
        self.assertEqual(stats, {})

    def test_nba_api_columns_map_to_the_same_families(self):
        row = {"PTS": 25, "REB": 7, "AST": 5, "FG3M": 4, "STL": 2, "BLK": 1}
        stats = nba.extract_nba_api_stats(row)
        self.assertEqual(stats["3PM"], 4.0)
        self.assertEqual(stats["PRA"], 37.0)

    def test_nba_api_nan_is_missing_not_zero(self):
        row = {"PTS": 25, "REB": float("nan"), "AST": 5}
        stats = nba.extract_nba_api_stats(row)
        self.assertNotIn("REB", stats)
        self.assertNotIn("PRA", stats)


class QuarantineTests(unittest.TestCase):
    def test_unplayed_statuses_quarantine(self):
        for status in ("Postponed", "postponed - weather", "Suspended", "Canceled", "Rescheduled"):
            self.assertTrue(nba.is_quarantined_status(status), status)

    def test_played_statuses_do_not(self):
        for status in ("Final", "Scheduled", "In Progress", None, ""):
            self.assertFalse(nba.is_quarantined_status(status), status)

    def test_quarantined_row_is_never_graded(self):
        row = nba.quarantine_row({"market": "PTS", "line": 25.5}, "Postponed")
        self.assertEqual(row["result"], nba.QUARANTINED_RESULT)
        self.assertNotIn(row["result"], ("win", "loss", "push", "pending"))

    def test_quarantined_rows_produce_no_lineage(self):
        row = nba.quarantine_row({"market": "PTS", "date": "2026-10-21"}, "Postponed")
        self.assertIsNone(nba.lineage_row(row))


class LineageTests(unittest.TestCase):
    GRADED = {
        "date": "2026-10-21",
        "gameId": "401859967",
        "playerId": 3147657,
        "market": "AST",
        "line": 2.5,
        "bookmaker": "fanduel",
        "team": "NY",
        "opponent": "SA",
        "result": "win",
        "settlementSource": "espn",
        "settledAt": "2026-10-22T06:00:00Z",
        "tipoffIso": "2026-10-22T00:30Z",
    }

    def test_graded_row_projects_to_a_complete_chain(self):
        row = nba.lineage_row(self.GRADED)
        self.assertEqual(row["settlementSource"], "espn-official-scores")
        self.assertIn(row["settlementSource"], nba.OFFICIAL_SETTLEMENT_SOURCES)
        self.assertEqual(row["providerEventId"], "401859967")
        self.assertTrue(row["eventId"].startswith("nba:"))
        self.assertEqual(nba.validate_settlement_lineage([row]), [])

    def test_ungraded_rows_carry_no_lineage(self):
        for result in ("invalid", "stats_unavailable", nba.QUARANTINED_RESULT):
            self.assertIsNone(nba.lineage_row({**self.GRADED, "result": result}), result)

    def test_unmapped_stat_source_is_refused_by_name(self):
        row = nba.lineage_row({**self.GRADED, "settlementSource": "web_snippet"})
        violations = nba.validate_settlement_lineage([row])
        self.assertTrue(any(v.startswith("UNTRUSTED_SOURCE") for v in violations), violations)

    def test_settling_before_tipoff_is_refused(self):
        row = nba.lineage_row({**self.GRADED, "settledAt": "2026-10-21T23:00:00Z"})
        violations = nba.validate_settlement_lineage([row])
        self.assertTrue(
            any(v.startswith("IMPOSSIBLE_RELATIONSHIP") for v in violations), violations
        )

    def test_one_provider_id_across_two_events_is_refused(self):
        a = nba.lineage_row(self.GRADED)
        b = nba.lineage_row({**self.GRADED, "playerId": 1, "team": "BOS", "opponent": "MIA"})
        violations = nba.validate_settlement_lineage([a, b])
        self.assertTrue(any(v.startswith("DUPLICATE_MAPPING") for v in violations), violations)

    def test_two_books_on_the_same_prop_are_not_a_duplicate_prediction(self):
        a = nba.lineage_row(self.GRADED)
        b = nba.lineage_row({**self.GRADED, "bookmaker": "draftkings"})
        self.assertNotEqual(a["id"], b["id"])
        self.assertEqual(nba.validate_settlement_lineage([a, b]), [])

    def test_the_gate_raises_rather_than_warns(self):
        bad = {**self.GRADED, "settlementSource": "web_snippet"}
        # Resolved through the module, not through NBA's re-exported binding: the MLB lineage suite
        # reloads `settlement_lineage` for its own mutation proof, which rebinds the class inside the
        # shared module namespace. The raising function then throws the NEW class while a by-name
        # import still points at the OLD one, so a by-name assertion passes alone and fails when the
        # two suites run together. Looking the class up at assert time is order-independent.
        with self.assertRaises(sl.SettlementLineageError):
            nba.assert_nba_settlement_lineage([bad], date="2026-10-21")


class HistoricalCorpusTests(unittest.TestCase):
    """READ-ONLY dry runs against the real 2026 playoff corpus. Nothing here writes."""

    @classmethod
    def setUpClass(cls):
        cls.rows = read_settled()

    def test_corpus_matches_the_readiness_measurement(self):
        counts = Counter(r.get("result") for r in self.rows)
        self.assertEqual(len(self.rows), HISTORICAL_TOTAL_ROWS)
        self.assertEqual(counts["invalid"], HISTORICAL_INVALID_ROWS)

    def test_every_invalid_row_is_a_short_circuited_family(self):
        families = {r.get("market") for r in self.rows if r.get("result") == "invalid"}
        self.assertEqual(families, set(SHORT_CIRCUITED_FAMILIES))

    def test_the_expansion_does_not_reach_the_historical_rows(self):
        """The 903 stay invalid: their dates all resolve to the legacy whitelist."""
        for row in self.rows:
            if row.get("result") != "invalid":
                continue
            self.assertNotIn(
                row.get("market"),
                nba.supported_markets_for_date(row.get("date")),
                f"{row.get('date')} {row.get('market')} would be restamped",
            )

    def test_lineage_dry_run_over_every_settled_date(self):
        """What the gate WOULD have done to the corpus, had it ever run for NBA.

        It refuses, on two shapes, and the numbers below are the measurement rather than a target:

          MISSING_LINEAGE       856 of 3,635 graded rows carry `team`/`opponent` as empty strings,
                                so no canonical eventId is derivable. Those results are graded
                                against a game nobody can name from the row.
          DUPLICATE_PREDICTION  677 predictions appear more than once, byte-identical including
                                `settledAt` — the ledger double-counts them.

        Neither is repaired here. Restamping the corpus would destroy the evidence; the dry run's
        job is to make the state visible before the first forward run, which is the whole reason
        gate G4 reads FAIL today.
        """
        by_date: dict[str, list[dict]] = defaultdict(list)
        for row in self.rows:
            by_date[row.get("date")].append(row)
        self.assertGreaterEqual(len(by_date), 16)

        graded_total = 0
        codes: Counter = Counter()
        refused_dates = 0
        for date, rows in sorted(by_date.items()):
            report = nba.dry_run_lineage(rows, date=date)
            graded_total += report["gradedRows"]
            for violation in report["violations"]:
                codes[violation.split(":")[0]] += 1
            if not report["wouldWrite"]:
                refused_dates += 1

        self.assertEqual(graded_total, 3635, "decisive+push rows carried into lineage")
        self.assertEqual(codes["MISSING_LINEAGE"], 856)
        self.assertEqual(codes["DUPLICATE_PREDICTION"], 677)
        self.assertEqual(set(codes), {"MISSING_LINEAGE", "DUPLICATE_PREDICTION"})
        self.assertEqual(refused_dates, 15)

    def test_the_forward_shape_the_dry_run_asks_for_passes_the_gate(self):
        """A row with the fields the historical corpus lacks reconstructs cleanly."""
        forward = [
            {
                "date": "2026-10-21",
                "gameId": "401859967",
                "playerId": 3147657,
                "market": "3PM",
                "line": 2.5,
                "bookmaker": "fanduel",
                "team": "NY",
                "opponent": "SA",
                "result": "win",
                "settlementSource": "espn",
                "settledAt": "2026-10-22T06:00:00Z",
                "tipoffIso": "2026-10-22T00:30Z",
            }
        ]
        report = nba.dry_run_lineage(forward, date="2026-10-21")
        self.assertEqual(report["violations"], [])
        self.assertTrue(report["wouldWrite"])

    def test_dry_run_is_read_only(self):
        before = SETTLED_PATH.stat().st_mtime_ns
        digest = SETTLED_PATH.read_bytes()
        nba.dry_run_lineage(self.rows[:200], date="2026-06-13")
        self.assertEqual(SETTLED_PATH.stat().st_mtime_ns, before)
        self.assertEqual(SETTLED_PATH.read_bytes(), digest)


if __name__ == "__main__":
    unittest.main()
