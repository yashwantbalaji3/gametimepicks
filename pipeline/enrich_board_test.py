"""
PR 11 — Tests for enrich_board.

Synthetic boards + mocked fetch/score functions. No network calls.
"""
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock

from pipeline.enrich_board import _is_enrichment_candidate, enrich_board


def _make_lean(**overrides) -> dict:
    base = {
        "id": "test-lean",
        "date": "2026-05-12",
        "playerId": 12345,
        "playerName": "Test Player",
        "team": "TEST",
        "market": "PTS",
        "line": 20.5,
        "oddsOver": -110,
        "oddsUnder": -110,
        "homeAway": "Home",
        "projection": None,
        "modelProjection": None,
        "modelProbability": None,
        "edgePct": None,
        "edge": None,
        "lean": "Pass",
        "pickType": "no_play",
        "confidence": "trends_pending",
        "reason": "trends_pending: projection will be attached in enrichment pass",
    }
    base.update(overrides)
    return base


def _make_board_file(tmpdir: str, leans: list[dict]) -> Path:
    p = Path(tmpdir) / "2026-05-12.json"
    p.write_text(json.dumps({
        "generatedFor": "2026-05-12",
        "generatedAt": "2026-05-12T15:00:00+00:00",
        "dataMode": "Live",
        "parsedPropCount": len(leans),
        "leans": leans,
    }, indent=2))
    return p


class IsEnrichmentCandidateTests(unittest.TestCase):
    def test_trends_pending_with_pid_is_candidate(self) -> None:
        self.assertTrue(_is_enrichment_candidate(_make_lean()))

    def test_already_scored_not_candidate(self) -> None:
        self.assertFalse(_is_enrichment_candidate(
            _make_lean(confidence="High", projection=22.5)
        ))

    def test_zero_playerid_not_candidate(self) -> None:
        self.assertFalse(_is_enrichment_candidate(_make_lean(playerId=0)))

    def test_insufficient_data_not_candidate(self) -> None:
        self.assertFalse(_is_enrichment_candidate(
            _make_lean(confidence="insufficient_data")
        ))

    def test_has_projection_not_candidate(self) -> None:
        self.assertFalse(_is_enrichment_candidate(
            _make_lean(projection=15.0)
        ))


class EnrichBoardDryRunTests(unittest.TestCase):
    def test_dry_run_does_not_fetch(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            board_path = _make_board_file(tmpdir, [
                _make_lean(playerId=100, market="PTS"),
                _make_lean(playerId=101, market="AST"),
            ])
            with patch("pipeline.enrich_board.fetch_player_game_logs") as mfetch:
                result = enrich_board(board_path, limit=30, dry_run=True)
                mfetch.assert_not_called()
            self.assertEqual(result["enriched"], 0)
            self.assertEqual(result["candidates"], 2)
            self.assertEqual(result["playersToFetch"], 2)
            self.assertTrue(result["dryRun"])

    def test_no_candidates_no_fetch(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            # All leans are zero-pid or already scored
            board_path = _make_board_file(tmpdir, [
                _make_lean(playerId=0),
                _make_lean(playerId=100, confidence="High", projection=22.5),
            ])
            with patch("pipeline.enrich_board.fetch_player_game_logs") as mfetch:
                result = enrich_board(board_path, limit=30, dry_run=False)
                mfetch.assert_not_called()
            self.assertEqual(result["enriched"], 0)
            self.assertEqual(result["candidates"], 0)


class EnrichBoardWithMocksTests(unittest.TestCase):
    def _setup_mocks(self):
        """Returns (logs_mock, feats_mock, scored_mock, r10_mock) patchers."""
        # Fake game logs return something truthy
        fake_logs = [object()] * 10
        # Fake features dict
        fake_feats = {"avg_pts": 22.0, "min_played": 32.0}
        # Fake ScoredProp
        scored = MagicMock()
        scored.projection = 22.5
        scored.model_probability = 0.58
        scored.edge_pct = 5.2
        scored.confidence = "Medium"
        scored.lean = "Over"
        scored.reason = "Medium: model edge"
        # Fake recent10
        fake_r10 = {"PTS": [18, 22, 25, 19, 24], "REB": [], "AST": []}
        return fake_logs, fake_feats, scored, fake_r10

    def test_respects_limit(self) -> None:
        """If 50 trends_pending leans exist, limit=5 → only 5 unique players fetched."""
        with tempfile.TemporaryDirectory() as tmpdir:
            leans = [_make_lean(playerId=1000 + i, market="PTS") for i in range(50)]
            board_path = _make_board_file(tmpdir, leans)

            fake_logs, fake_feats, scored, fake_r10 = self._setup_mocks()
            with patch("pipeline.enrich_board.fetch_player_game_logs",
                       return_value=(fake_logs, "fake")) as mfetch, \
                 patch("pipeline.enrich_board.build_player_features",
                       return_value=fake_feats), \
                 patch("pipeline.enrich_board.score_prop",
                       return_value=scored), \
                 patch("pipeline.enrich_board.extract_recent10_all_markets",
                       return_value=fake_r10):
                result = enrich_board(board_path, limit=5, dry_run=False)

            self.assertEqual(mfetch.call_count, 5,
                             f"limit=5 but called fetch {mfetch.call_count} times")
            self.assertEqual(result["playersToFetch"], 5)
            self.assertEqual(result["enriched"], 5)

    def test_already_scored_not_touched(self) -> None:
        """Mix scored + trends_pending; only trends_pending leans updated."""
        with tempfile.TemporaryDirectory() as tmpdir:
            scored_lean = _make_lean(
                playerId=100, market="PTS",
                confidence="High", projection=25.0, edge=3.0,
            )
            tp_lean = _make_lean(playerId=101, market="AST")
            board_path = _make_board_file(tmpdir, [scored_lean, tp_lean])

            fake_logs, fake_feats, scored, fake_r10 = self._setup_mocks()
            with patch("pipeline.enrich_board.fetch_player_game_logs",
                       return_value=(fake_logs, "fake")), \
                 patch("pipeline.enrich_board.build_player_features",
                       return_value=fake_feats), \
                 patch("pipeline.enrich_board.score_prop",
                       return_value=scored), \
                 patch("pipeline.enrich_board.extract_recent10_all_markets",
                       return_value=fake_r10):
                enrich_board(board_path, limit=30, dry_run=False)

            # Re-read board and verify scored_lean is unchanged
            updated = json.loads(board_path.read_text())
            preserved = updated["leans"][0]
            self.assertEqual(preserved["playerId"], 100)
            self.assertEqual(preserved["confidence"], "High")
            self.assertEqual(preserved["projection"], 25.0)
            # And tp_lean got enriched
            enriched = updated["leans"][1]
            self.assertEqual(enriched["confidence"], "Medium")
            self.assertEqual(enriched["projection"], 22.5)


if __name__ == "__main__":
    unittest.main()
