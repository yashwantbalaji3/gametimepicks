"""Fail-closed tests for World Cup readiness — schedule/teams may be live, but odds /
stats / projections / parlays MUST stay false until real providers are connected."""
from __future__ import annotations

import unittest
from unittest import mock

from pipeline import build_world_cup_readiness as wc


class WorldCupReadinessTests(unittest.TestCase):
    def _derive(self, **files):
        def fake_load(name):
            return files.get(name)
        with mock.patch.object(wc, "_load", fake_load):
            return wc.derive()

    def test_real_schedule_teams_are_ready(self):
        r = self._derive(**{"schedule.json": {"matches": [{} for _ in range(104)]},
                            "teams.json": [{} for _ in range(48)],
                            "groups.json": {"groups": [{} for _ in range(12)]}})
        self.assertTrue(r["scheduleReady"]); self.assertTrue(r["teamsReady"])
        self.assertEqual(r["publicLevel"], "schedule-only")

    def test_projections_and_parlays_fail_closed(self):
        r = self._derive(**{"schedule.json": {"matches": [{} for _ in range(104)]},
                            "teams.json": [{} for _ in range(48)]})
        self.assertFalse(r["oddsReady"]); self.assertFalse(r["statsReady"])
        self.assertFalse(r["projectionsReady"]); self.assertFalse(r["parlayReady"])
        self.assertTrue(any("odds provider" in b for b in r["blockers"]))

    def test_empty_data_is_setup(self):
        r = self._derive()
        self.assertFalse(r["scheduleReady"])
        self.assertEqual(r["publicLevel"], "setup")
        self.assertFalse(r["projectionsReady"])

    def test_squads_withheld_until_published(self):
        r = self._derive(**{"schedule.json": {"matches": [{}]}, "teams.json": [{}],
                            "squads.json": {}})
        self.assertFalse(r["counts"]["squadsPublished"])


if __name__ == "__main__":
    unittest.main()
