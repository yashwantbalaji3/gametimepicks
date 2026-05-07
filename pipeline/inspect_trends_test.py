"""
Phase 11 — pipeline.inspect_trends_test

Tests the recent10 coverage inspector against synthetic board JSONs.
Zero network. Zero filesystem mutation outside /tmp.
"""
from __future__ import annotations

import json
import tempfile
from pathlib import Path

from .inspect_trends import inspect_board


def _make_board(path: Path, leans: list[dict], **board_kwargs) -> Path:
    """Helper: write a synthetic board JSON to disk for the inspector to read."""
    payload = {
        "leans": leans,
        **board_kwargs,
    }
    path.write_text(json.dumps(payload))
    return path


def main() -> int:
    asserts = 0

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)

        # ── Test 1: empty leans
        b = _make_board(tmp_path / "empty.json", [])
        cov = inspect_board(b)
        assert cov is not None
        assert cov.total_leans == 0
        assert cov.leans_with_recent10 == 0
        assert cov.unique_player_ids == 0
        asserts += 4

        # ── Test 2: full coverage (all leans have recent10)
        leans_full = [
            {"playerId": 100, "playerName": "Alice", "market": "PTS", "recent10": [10, 11, 12]},
            {"playerId": 100, "playerName": "Alice", "market": "REB", "recent10": [5, 6, 7]},
            {"playerId": 100, "playerName": "Alice", "market": "AST", "recent10": [3, 4, 5]},
        ]
        b = _make_board(tmp_path / "full.json", leans_full, recent10AttachedAt="2026-05-07T03:00:00+00:00")
        cov = inspect_board(b)
        assert cov.total_leans == 3
        assert cov.leans_with_recent10 == 3
        assert cov.unique_player_ids == 1
        assert cov.valid_player_ids == 1
        assert cov.zero_id_players == 0
        assert len(cov.players_with_data) == 1
        assert cov.players_with_data[0] == (100, "Alice")
        assert cov.recent10_attached_at == "2026-05-07T03:00:00+00:00"
        asserts += 8

        # ── Test 3: partial coverage (one player has data, one doesn't)
        leans_partial = [
            {"playerId": 100, "playerName": "Alice", "market": "PTS", "recent10": [10, 11]},
            {"playerId": 200, "playerName": "Bob", "market": "PTS"},  # no recent10
            {"playerId": 200, "playerName": "Bob", "market": "REB"},
        ]
        b = _make_board(tmp_path / "partial.json", leans_partial)
        cov = inspect_board(b)
        assert cov.total_leans == 3
        assert cov.leans_with_recent10 == 1
        assert cov.unique_player_ids == 2
        assert cov.valid_player_ids == 2
        assert (100, "Alice") in cov.players_with_data
        assert any(name == "Bob" and reason == "no_logs" for _, name, reason in cov.players_without_data)
        asserts += 6

        # ── Test 4: zero_id players surfaced clearly
        leans_zero = [
            {"playerId": 0, "playerName": "Cade Cunningham", "market": "PTS"},
            {"playerId": 0, "playerName": "Cade Cunningham", "market": "REB"},
            {"playerId": 100, "playerName": "Alice", "market": "PTS", "recent10": [1, 2]},
        ]
        b = _make_board(tmp_path / "zero.json", leans_zero)
        cov = inspect_board(b)
        assert cov.zero_id_players == 1
        assert cov.valid_player_ids == 1
        assert any(reason == "zero_id" for _, _, reason in cov.players_without_data)
        asserts += 3

        # ── Test 5: malformed recent10 (not a list)
        leans_bad = [
            {"playerId": 100, "playerName": "Alice", "market": "PTS", "recent10": "not a list"},
            {"playerId": 100, "playerName": "Alice", "market": "REB", "recent10": []},
            {"playerId": 100, "playerName": "Alice", "market": "AST", "recent10": [1]},  # only 1 value
        ]
        b = _make_board(tmp_path / "bad.json", leans_bad)
        cov = inspect_board(b)
        # All three should fail the "isinstance(list) and len >= 2" check
        assert cov.leans_with_recent10 == 0
        # But Alice has playerId 100 (valid) so she counts as valid_player_ids
        assert cov.valid_player_ids == 1
        # And she should be classified as no_logs (no markets with valid data)
        assert any(name == "Alice" and reason == "no_logs" for _, name, reason in cov.players_without_data)
        asserts += 3

        # ── Test 6: malformed JSON returns None
        bad_path = tmp_path / "garbage.json"
        bad_path.write_text("{not json at all")
        cov = inspect_board(bad_path)
        assert cov is None
        asserts += 1

        # ── Test 7: no recent10AttachedAt → None
        leans_no_attach = [
            {"playerId": 100, "playerName": "Alice", "market": "PTS", "recent10": [1, 2]},
        ]
        b = _make_board(tmp_path / "no_attach.json", leans_no_attach)
        cov = inspect_board(b)
        assert cov.recent10_attached_at is None
        asserts += 1

        # ── Test 8: market != PTS/REB/AST is not counted in player breakdown
        # (matches the strict 3-market contract the UI expects)
        leans_other = [
            {"playerId": 100, "playerName": "Alice", "market": "STL", "recent10": [1, 2]},
        ]
        b = _make_board(tmp_path / "other.json", leans_other)
        cov = inspect_board(b)
        # Counted in totals (1 lean)...
        assert cov.total_leans == 1
        # ...and recent10 counted (it's still on the lean)
        assert cov.leans_with_recent10 == 1
        # But Alice has no PTS/REB/AST market, so she'll appear in "without_data" as no_logs
        # OR she may appear in players_with_data if any of her PTS/REB/AST markets have data.
        # In this test no PTS/REB/AST exists, so she should be in without_data.
        assert (100, "Alice", "no_logs") in cov.players_without_data
        asserts += 3

    print(f"\n  ✓ all {asserts} inspector assertions passed\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
