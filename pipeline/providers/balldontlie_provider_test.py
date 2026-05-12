"""PR 12 — tests for balldontlie provider. All HTTP mocked."""
from __future__ import annotations

import unittest
from unittest.mock import patch, MagicMock

from pipeline import config as C
from pipeline.providers.balldontlie_provider import BallDontLieProvider
from pipeline.providers.base import (
    ProviderUnavailable, ProviderRequestFailed, ProviderNotImplemented,
)


class ConfigurationGatingTests(unittest.TestCase):
    def test_missing_key_raises_unavailable(self) -> None:
        with patch.object(C, "BALLDONTLIE_API_KEY", None), \
             patch.object(C, "ENABLE_BALLDONTLIE_FALLBACK", True):
            with self.assertRaises(ProviderUnavailable):
                BallDontLieProvider().fetch_player_game_logs(1630162)

    def test_disabled_flag_raises_unavailable(self) -> None:
        with patch.object(C, "BALLDONTLIE_API_KEY", "k"), \
             patch.object(C, "ENABLE_BALLDONTLIE_FALLBACK", False):
            with self.assertRaises(ProviderUnavailable):
                BallDontLieProvider().fetch_player_game_logs(1630162)

    def test_unimplemented_methods_raise(self) -> None:
        with patch.object(C, "BALLDONTLIE_API_KEY", "k"), \
             patch.object(C, "ENABLE_BALLDONTLIE_FALLBACK", True):
            p = BallDontLieProvider()
            with self.assertRaises(ProviderNotImplemented):
                p.fetch_schedule("2026-05-12")


class StatusReportingTests(unittest.TestCase):
    def test_enabled_when_configured(self) -> None:
        with patch.object(C, "BALLDONTLIE_API_KEY", "k"), \
             patch.object(C, "ENABLE_BALLDONTLIE_FALLBACK", True):
            s = BallDontLieProvider().get_status()
            self.assertTrue(s.enabled)
            self.assertFalse(s.is_stub)
            self.assertEqual(s.tier, 1)

    def test_disabled_when_no_key(self) -> None:
        with patch.object(C, "BALLDONTLIE_API_KEY", ""), \
             patch.object(C, "ENABLE_BALLDONTLIE_FALLBACK", True):
            s = BallDontLieProvider().get_status()
            self.assertFalse(s.enabled)


class GameLogsFetchTests(unittest.TestCase):
    def _make(self):
        p = BallDontLieProvider()
        p._key = "test-key"
        p._enabled = True
        p._player_index = {1630162: 27}
        return p

    def test_successful_fetch_uses_rate_limiter(self) -> None:
        api_response = {
            "data": [
                {"pts": 28, "reb": 5, "ast": 6, "min": "36:00",
                 "team": {"id": 17},
                 "game": {"date": "2026-05-10", "home_team_id": 17, "visitor_team_id": 11}},
            ], "meta": {}
        }
        with patch("pipeline.providers.balldontlie_provider._do_get",
                   return_value=api_response) as mget, \
             patch("pipeline.providers.balldontlie_provider._cache_get", return_value=None), \
             patch("pipeline.providers.balldontlie_provider._cache_put"):
            p = self._make()
            logs = p.fetch_player_game_logs(1630162, last_n=10)
        self.assertEqual(len(logs), 1)
        self.assertEqual(logs[0].pts, 28)
        self.assertEqual(logs[0].game_date, "2026-05-10")
        self.assertEqual(logs[0].home_away, "Home")

    def test_player_not_in_index_raises(self) -> None:
        p = self._make()
        p._player_index = {9999: 99}
        with self.assertRaises(ProviderRequestFailed):
            p.fetch_player_game_logs(1630162)

    def test_network_error_raises_provider_error(self) -> None:
        import requests
        with patch("pipeline.providers.balldontlie_provider._do_get",
                   side_effect=requests.ConnectionError("network")), \
             patch("pipeline.providers.balldontlie_provider._cache_get", return_value=None):
            with self.assertRaises(ProviderRequestFailed):
                self._make().fetch_player_game_logs(1630162)

    def test_cache_hit_skips_network(self) -> None:
        cached = [{
            "player_id": 1630162, "game_date": "2026-05-10",
            "opponent_abbr": "", "home_away": "Home",
            "minutes": 36.0, "pts": 28, "reb": 5, "ast": 6,
        }]
        with patch("pipeline.providers.balldontlie_provider._do_get") as mget, \
             patch("pipeline.providers.balldontlie_provider._cache_get", return_value=cached):
            logs = self._make().fetch_player_game_logs(1630162)
            mget.assert_not_called()
        self.assertEqual(logs[0].pts, 28)


class RateLimiterTests(unittest.TestCase):
    def test_rate_limiter_enforces_minimum_interval(self) -> None:
        """Two consecutive _do_get calls should be spaced by at least the interval."""
        import time
        import pipeline.providers.balldontlie_provider as bp
        # Force a small interval for the test
        orig = bp._REQUEST_INTERVAL_S
        bp._REQUEST_INTERVAL_S = 0.05
        bp._LAST_REQUEST_AT = 0.0
        try:
            with patch("pipeline.providers.balldontlie_provider.requests.get") as mget:
                resp = MagicMock(status_code=200)
                resp.json.return_value = {"data": [], "meta": {}}
                resp.raise_for_status = MagicMock()
                mget.return_value = resp
                t0 = time.time()
                bp._do_get("http://x", "k", {})
                bp._do_get("http://x", "k", {})
                elapsed = time.time() - t0
            self.assertGreaterEqual(elapsed, 0.05)
        finally:
            bp._REQUEST_INTERVAL_S = orig


if __name__ == "__main__":
    unittest.main()
