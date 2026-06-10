"""Tests for prop-odds status writer + inactive base (must stay fail-closed)."""
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from pipeline.ufc import build_prop_odds as bp
from pipeline.ufc.providers import prop_odds_base as base


class PropOddsStatusTests(unittest.TestCase):
    def setUp(self):
        self._d = tempfile.TemporaryDirectory()
        self._data = Path(self._d.name)
        self._patch = mock.patch.object(bp, "DATA", self._data)
        self._patch.start()

    def tearDown(self):
        self._patch.stop(); self._d.cleanup()

    def test_unavailable_when_no_provider(self):
        st = bp.write_status()
        self.assertEqual(st["status"], "unavailable")
        self.assertFalse(st["providerConnected"])
        self.assertFalse(st["methodPropsReady"])
        self.assertFalse(st["distancePropsReady"])
        self.assertFalse(st["roundPropsReady"])
        self.assertEqual(st["blocker"], "no real prop odds provider connected")
        self.assertTrue((self._data / "prop-odds-latest.json").exists())

    def test_discovery_returned_but_no_provider_still_locked(self):
        # even if a discovery probe saw a market, props stay false without a connected provider
        (self._data / "prop-odds-discovery-latest.json").write_text(json.dumps(
            {"generatedAt": "2026-06-09T00:00:00+00:00",
             "available": {"fight_result_method": {"returned": True}}}))
        st = bp.write_status()
        self.assertFalse(st["providerConnected"])
        self.assertFalse(st["methodPropsReady"])
        self.assertEqual(st["status"], "unavailable")

    def test_base_reports_no_active_provider(self):
        self.assertIsNone(base.ACTIVE_PROVIDER)
        self.assertFalse(base.props_available())


if __name__ == "__main__":
    unittest.main()
