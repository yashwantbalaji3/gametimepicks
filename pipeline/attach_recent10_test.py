"""
PR 21 — deterministic tests for pipeline.attach_recent10 preserve-on-failure.

Verifies the bug fix that prevented daily-refresh from destructively
wiping recent10 arrays when player-log fetches fail or return empty.

Hard rule: no pandas / numpy / nba_api imports here. The
attach_recent10 module imports `fetch_player_game_logs` lazily inside
`fetch_logs_for_player`, and the test mocks `fetch_logs_for_player`
at the module seam — so the heavy provider chain never loads.
"""
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from . import attach_recent10 as A


def _lean(
    *,
    player_id: int = 100,
    player_name: str = "Test Player",
    market: str = "PTS",
    recent10=None,
    projection: float = 22.0,
    confidence: str = "Medium",
) -> dict:
    """Build a board lean dict. recent10=None means the key is absent."""
    out = {
        "id": f"lean-{player_id}-{market}",
        "playerId": player_id,
        "playerName": player_name,
        "market": market,
        "line": 22.5,
        "projection": projection,
        "edgePct": 5.0,
        "confidence": confidence,
        "lean": "Over",
        "bookmaker": "draftkings",
        "riskFlags": [],
    }
    if recent10 is not None:
        out["recent10"] = recent10
    return out


def _write_board(tmp: Path, leans: list[dict]) -> Path:
    p = tmp / "2026-05-13.json"
    p.write_text(json.dumps({
        "generatedFor": "2026-05-13",
        "generatedAt": "2026-05-13T19:20:59+00:00",
        "leans": leans,
    }, indent=2))
    return p


class PreserveExistingRecent10Tests(unittest.TestCase):
    """The PR 21 bug fix: existing arrays must survive fetch failures."""

    def test_preserves_recent10_on_no_logs(self) -> None:
        """Fetch returns ([], None) → no_logs path. Existing array survives."""
        existing = [12.0, 14.0, 18.0, 20.0, 22.0, 24.0, 16.0, 19.0, 21.0, 17.0]
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            path = _write_board(tmp, [_lean(recent10=existing)])
            with patch.object(A, "fetch_logs_for_player", return_value=([], None)):
                summary = A.attach_recent10_to_board(path)
            updated = json.loads(path.read_text())["leans"][0]
            self.assertEqual(
                updated.get("recent10"), existing,
                "existing recent10 array must be preserved on no_logs fetch",
            )
            self.assertIn(
                "no_logs",
                summary.get("unmatchedByReason", {}),
                "summary should record no_logs reason",
            )
            self.assertEqual(summary.get("leansUpdated", -1), 0)
            self.assertEqual(summary.get("leansCleared", -1), 0,
                             "PR 21: leans_cleared must always be 0")

    def test_preserves_recent10_on_fetch_error(self) -> None:
        """Fetch returns ([], 'fetch_error: ...'). Existing array survives."""
        existing = [5.0, 6.0, 7.0, 8.0, 9.0]
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            path = _write_board(tmp, [_lean(market="AST", recent10=existing)])
            with patch.object(
                A, "fetch_logs_for_player",
                return_value=([], "fetch_error: ReadTimeout"),
            ):
                A.attach_recent10_to_board(path)
            updated = json.loads(path.read_text())["leans"][0]
            self.assertEqual(
                updated.get("recent10"), existing,
                "existing recent10 array must be preserved on fetch_error",
            )

    def test_preserves_recent10_on_zero_pid(self) -> None:
        """playerId=0 short-circuits before any fetch. Existing array survives."""
        existing = [10.0, 11.0, 12.0]
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            path = _write_board(tmp, [_lean(player_id=0, recent10=existing)])
            # fetch_logs_for_player should not even be called for pid=0; patch
            # it anyway to a tripwire that would raise if invoked.
            with patch.object(
                A, "fetch_logs_for_player",
                side_effect=AssertionError("fetch_logs_for_player must not be called for pid=0"),
            ):
                summary = A.attach_recent10_to_board(path)
            updated = json.loads(path.read_text())["leans"][0]
            self.assertEqual(
                updated.get("recent10"), existing,
                "existing recent10 must be preserved when playerId=0",
            )
            self.assertEqual(
                summary.get("unmatchedByReason", {}).get("zero_id"), 1,
                "zero_id should appear in unmatchedByReason",
            )

    def test_attaches_recent10_when_data_available(self) -> None:
        """Fetch succeeds with real logs → new recent10 is populated."""
        # Lean has NO recent10 to start with — proves attachment still works.
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            path = _write_board(tmp, [_lean(market="PTS", recent10=None)])
            # Build minimal fake logs that extract_recent10_all_markets accepts.
            fake_logs = [
                {"game_date": f"2026-04-{day:02d}", "pts": pts, "reb": 5, "ast": 3}
                for day, pts in enumerate([20, 22, 24, 18, 21], start=1)
            ]
            with patch.object(A, "fetch_logs_for_player", return_value=(fake_logs, None)):
                summary = A.attach_recent10_to_board(path)
            updated = json.loads(path.read_text())["leans"][0]
            self.assertEqual(
                updated.get("recent10"), [20.0, 22.0, 24.0, 18.0, 21.0],
                "valid fetch must populate recent10 with PTS values "
                "(oldest → newest)",
            )
            self.assertEqual(summary.get("leansUpdated"), 1)

    def test_does_not_alter_other_fields(self) -> None:
        """No-logs fetch must not touch projection / edge / confidence / etc."""
        existing = [1.0, 2.0, 3.0]
        lean_in = _lean(
            recent10=existing,
            projection=18.75,
            confidence="High",
        )
        lean_in["customFlag"] = "do-not-touch"
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            path = _write_board(tmp, [lean_in])
            with patch.object(A, "fetch_logs_for_player", return_value=([], None)):
                A.attach_recent10_to_board(path)
            updated = json.loads(path.read_text())["leans"][0]
            # Every original field must still be present and unchanged.
            for k, v in lean_in.items():
                self.assertEqual(updated.get(k), v,
                                 f"field {k!r} must not be modified by attach")

    def test_preserves_recent10_for_some_markets_when_others_attach(self) -> None:
        """
        Mixed-market case: a player whose logs are fetched successfully but
        whose PTS logs are valid while REB returns []. The PTS lean should
        get its recent10 updated; the REB lean's existing recent10 must
        survive (preserve-on-empty-market).
        """
        existing_reb = [7.0, 8.0, 9.0, 10.0]
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            path = _write_board(tmp, [
                _lean(player_id=100, market="PTS", recent10=[0.0, 0.0]),
                _lean(player_id=100, market="REB", recent10=existing_reb),
            ])
            # Build logs where REB is missing (extractor drops entries
            # missing the stat key). Pass dicts WITHOUT the reb key so
            # all entries get dropped for REB while keeping PTS intact.
            fake_logs = [
                {"game_date": f"2026-04-{day:02d}", "pts": pts, "ast": 4}
                for day, pts in enumerate([15, 17, 19], start=1)
            ]
            with patch.object(A, "fetch_logs_for_player", return_value=(fake_logs, None)):
                A.attach_recent10_to_board(path)
            leans = json.loads(path.read_text())["leans"]
            pts_lean = next(l for l in leans if l["market"] == "PTS")
            reb_lean = next(l for l in leans if l["market"] == "REB")
            self.assertEqual(
                pts_lean.get("recent10"), [15.0, 17.0, 19.0],
                "PTS recent10 should be refreshed from new logs",
            )
            self.assertEqual(
                reb_lean.get("recent10"), existing_reb,
                "REB recent10 must be preserved because REB returned empty",
            )


class RescueR1SuppressedLeansTests(unittest.TestCase):
    """
    Phase 21.1: when generate_daily_board runs in live mode but game-log
    fetches fail mid-run, R1 stamps every lean `insufficient_data` BEFORE
    recent10 is attached. The guardrail idempotency check then blocks
    re-evaluation. attach_recent10 must rescue those leans once a
    sufficient log count lands so the model's original confidence is
    honored.
    """

    @staticmethod
    def _r1_stamped_lean(
        *,
        market: str = "PTS",
        line: float = 20.0,
        projection: float = 24.0,
        edge_pct: float = 18.0,
        original_conf: str = "High",
    ) -> dict:
        """Build a lean as it would look after R1 fired in the main pipeline."""
        return {
            "id": f"lean-100-{market}",
            "playerId": 100,
            "playerName": "Test Player",
            "market": market,
            "line": line,
            "projection": projection,
            "edgePct": edge_pct,
            "confidence": "insufficient_data",
            "lean": "No Play",
            "pickType": "no_play",
            "bookmaker": "draftkings",
            "riskFlags": [],
            "_guardrail": "R1_no_logs_insufficient_data",
            "_guardrailAt": "2026-05-18T20:09:14+00:00",
            "_originalConfidence": original_conf,
        }

    def test_rescues_R1_stamped_lean_when_logs_now_attached(self) -> None:
        """8 fresh log values → R1 stamp lifted, lean restored to Over / High."""
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            path = _write_board(tmp, [self._r1_stamped_lean()])
            fake_logs = [
                {"game_date": f"2026-04-{day:02d}", "pts": pts, "reb": 5, "ast": 3}
                for day, pts in enumerate([20, 22, 24, 18, 21, 23, 19, 25], start=1)
            ]
            with patch.object(A, "fetch_logs_for_player", return_value=(fake_logs, None)):
                summary = A.attach_recent10_to_board(path)
            updated = json.loads(path.read_text())["leans"][0]
            self.assertEqual(updated.get("confidence"), "High")
            self.assertEqual(updated.get("lean"), "Over")
            self.assertEqual(updated.get("pickType"), "model_lean")
            self.assertNotIn("_guardrail", updated)
            self.assertNotIn("_originalConfidence", updated)
            self.assertEqual(summary.get("leansRescued"), 1)

    def test_rescue_picks_Under_when_projection_below_line(self) -> None:
        """projection < line → lean side flips to Under."""
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            path = _write_board(tmp, [self._r1_stamped_lean(
                line=22.0, projection=18.0,
                original_conf="Medium",
            )])
            fake_logs = [
                {"game_date": f"2026-04-{day:02d}", "pts": pts, "reb": 5, "ast": 3}
                for day, pts in enumerate([14, 16, 18, 20, 17], start=1)
            ]
            with patch.object(A, "fetch_logs_for_player", return_value=(fake_logs, None)):
                A.attach_recent10_to_board(path)
            updated = json.loads(path.read_text())["leans"][0]
            self.assertEqual(updated.get("confidence"), "Medium")
            self.assertEqual(updated.get("lean"), "Under")

    def test_rescue_skipped_when_log_count_still_below_threshold(self) -> None:
        """< MEDIUM_CONF_MIN_LOGS (5) values → R1 stamp must stay."""
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            path = _write_board(tmp, [self._r1_stamped_lean()])
            # Only 3 logs — below MEDIUM_CONF_MIN_LOGS = 5.
            fake_logs = [
                {"game_date": f"2026-04-{day:02d}", "pts": pts, "reb": 5, "ast": 3}
                for day, pts in enumerate([20, 22, 24], start=1)
            ]
            with patch.object(A, "fetch_logs_for_player", return_value=(fake_logs, None)):
                summary = A.attach_recent10_to_board(path)
            updated = json.loads(path.read_text())["leans"][0]
            self.assertEqual(updated.get("confidence"), "insufficient_data",
                             "R1 stamp must survive when log count stays below MEDIUM threshold")
            self.assertEqual(updated.get("_guardrail"), "R1_no_logs_insufficient_data")
            self.assertEqual(summary.get("leansRescued"), 0)

    def test_extreme_edge_rescue_caps_at_Low_via_R5(self) -> None:
        """Edge > 25pp → after rescue, R5 caps confidence at Low + stamps suspicious_edge."""
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            path = _write_board(tmp, [self._r1_stamped_lean(
                line=18.0, projection=26.0, edge_pct=44.0,
                original_conf="High",
            )])
            fake_logs = [
                {"game_date": f"2026-04-{day:02d}", "pts": pts, "reb": 5, "ast": 3}
                for day, pts in enumerate([20, 22, 24, 18, 21, 23, 19, 25], start=1)
            ]
            with patch.object(A, "fetch_logs_for_player", return_value=(fake_logs, None)):
                A.attach_recent10_to_board(path)
            updated = json.loads(path.read_text())["leans"][0]
            self.assertEqual(updated.get("confidence"), "Low",
                             "R5 should cap a suspicious-edge lean at Low after rescue")
            self.assertIn("suspicious_edge", updated.get("riskFlags", []))
            self.assertEqual(updated.get("lean"), "Over")


if __name__ == "__main__":
    unittest.main()
