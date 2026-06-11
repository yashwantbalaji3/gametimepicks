"""Fail-closed gating tests for the World Cup stats readiness layer."""
import unittest
from pipeline.world_cup.readiness import compute_readiness
from pipeline.world_cup.providers.base import SoccerStatsProvider
from pipeline.world_cup.providers.sample import SampleProvider


class _FakeProvider(SoccerStatsProvider):
    """Configurable fake for testing the gates (no network)."""
    name = "fake"
    env_key = ""
    def __init__(self, *, configured, team=False, xg=False, lineups=False, players=False):
        self._cfg = configured
        self.supports_team_stats = team
        self.supports_xg = xg
        self.supports_lineups = lineups
        self.supports_player_stats = players
    def is_configured(self): return self._cfg
    def fixtures(self, date): return []
    def team_strength(self, team): return None
    def player_roles(self, team): return []


class ReadinessTests(unittest.TestCase):
    def test_unconfigured_provider_fails_closed(self):
        r = compute_readiness(_FakeProvider(configured=False), odds_ready=True)
        self.assertFalse(r["projectionsAllowed"])
        self.assertFalse(r["parlayAllowed"])
        self.assertFalse(r["playerPropsAllowed"])
        self.assertTrue(any("no soccer stats provider" in x for x in r["failClosedReasons"]))

    def test_projections_not_from_odds_alone(self):
        # Odds ready but NO team stats → market outlook only, no projection.
        r = compute_readiness(_FakeProvider(configured=True, team=False), odds_ready=True)
        self.assertFalse(r["projectionsAllowed"])
        self.assertEqual(r["perMarket"]["moneyline90"], "market_outlook_only")

    def test_team_projections_need_stats_and_odds(self):
        r = compute_readiness(_FakeProvider(configured=True, team=True), odds_ready=True)
        self.assertTrue(r["projectionsAllowed"])
        self.assertTrue(r["parlayAllowed"])
        self.assertEqual(r["perMarket"]["moneyline90"], "projection")
        # ...but no odds → still fail closed
        r2 = compute_readiness(_FakeProvider(configured=True, team=True), odds_ready=False)
        self.assertFalse(r2["projectionsAllowed"])

    def test_player_props_blocked_without_lineups(self):
        # Team + player stats but NO lineups → player props disabled.
        r = compute_readiness(
            _FakeProvider(configured=True, team=True, players=True, lineups=False),
            odds_ready=True,
        )
        self.assertFalse(r["playerPropsAllowed"])
        self.assertEqual(r["perMarket"]["anytimeGoalscorer"], "unavailable_no_lineups_or_odds")

    def test_player_props_need_lineups_players_odds(self):
        r = compute_readiness(
            _FakeProvider(configured=True, team=True, players=True, lineups=True),
            odds_ready=True,
        )
        self.assertTrue(r["playerPropsAllowed"])

    def test_evidence_overrides_capability_flags(self):
        # Provider CAN return team stats, but the actual sample is empty (tournament
        # just started) → projections must stay fail-closed.
        p = _FakeProvider(configured=True, team=True, players=True, lineups=True)
        r = compute_readiness(p, odds_ready=True, evidence={"teamStrengthTeams": 0, "lineupsFixtures": 0, "playerStatsRows": 0})
        self.assertFalse(r["projectionsAllowed"])
        self.assertFalse(r["playerPropsAllowed"])
        self.assertTrue(any("just started" in x or "team-stats sample" in x for x in r["failClosedReasons"]))
        # Once a real sample exists, projections unlock (lineups still gate player props).
        r2 = compute_readiness(p, odds_ready=True, evidence={"teamStrengthTeams": 4, "lineupsFixtures": 0, "playerStatsRows": 0})
        self.assertTrue(r2["projectionsAllowed"])
        self.assertFalse(r2["playerPropsAllowed"])

    def test_sample_provider_never_fabricates(self):
        p = SampleProvider()
        self.assertFalse(p.is_configured())
        self.assertEqual(p.fixtures("2026-06-11"), [])
        self.assertIsNone(p.team_strength("Mexico"))
        self.assertEqual(p.player_roles("Mexico"), [])


if __name__ == "__main__":
    unittest.main()
