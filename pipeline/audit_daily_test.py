"""Tests for `pipeline.audit_daily` — the daily model postmortem
generator.

Locks down the audit contract:
  - Pending excluded from hitRate denominator.
  - Pushes excluded from hitRate denominator (decisive = W+L).
  - byProfile derives risk profile from explicit field, falls back
    to slipId parsing for legacy snapshots.
  - sameGameNba flags any sameGame slip containing ≥1 NBA leg.
  - mixedSport is keyed off the slip's `sport == "multi"` field.
  - bySlipSize uses leg count.
  - byMarket / byPlayer / byTeam count leg-level decisive results.
  - Near-miss = lost by exactly one leg, no unresolved legs.
  - DNP/unavailable count = pending slips with ≥1 unresolved leg.
  - Recommendations fire only after a per-rule sample threshold.
  - Missing input → empty payload + clear warning.
"""
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from pipeline.audit_daily import (
    PROFILES,
    _empty_counter,
    _finalize,
    _is_near_miss,
    _is_same_game_nba,
    _profile_for_slip,
    audit,
)


# ---------------------------------------------------------------------------
# Fixture helpers — keep the shape small + recognizable.
# ---------------------------------------------------------------------------


def _leg(
    *,
    sport: str = "nba",
    player: str = "Player A",
    team: str = "NYK",
    market: str = "PTS",
    side: str = "Over",
    line: float = 20.5,
    result: str = "win",
    final_stat: float | None = None,
) -> dict:
    return {
        "sport": sport,
        "playerName": player,
        "team": team,
        "market": market,
        "side": side,
        "line": line,
        "result": result,
        "finalStat": final_stat if final_stat is not None else (line + 1 if result == "win" else line - 1),
    }


def _slip(
    *,
    profile: str = "balanced",
    sport: str = "nba",
    status: str = "win",
    same_game: bool = False,
    legs: list[dict] | None = None,
    slip_id: str | None = None,
) -> dict:
    return {
        "slipId": slip_id or f"opt_2026-05-25_{profile}_test{hash((profile, status, sport)) & 0xfff:03x}",
        "profile": profile,
        "sport": sport,
        "sameGame": same_game,
        "legs": legs if legs is not None else [_leg(sport=sport), _leg(sport=sport, player="Player B")],
        "status": status,
    }


def _graded(slips: list[dict], date: str = "2026-05-25") -> dict:
    return {
        "date": date,
        "totalSlips": len(slips),
        "uniqueSlips": slips,
    }


# ---------------------------------------------------------------------------
# Counter math
# ---------------------------------------------------------------------------


class HitRateMathTests(unittest.TestCase):

    def test_pending_excluded_from_hit_rate(self):
        slips = [
            _slip(status="win"),
            _slip(status="win"),
            _slip(status="loss"),
            _slip(status="pending"),
            _slip(status="pending"),
        ]
        a = audit("2026-05-25", graded=_graded(slips))
        s = a["summary"]
        # 2W + 1L = 3 decisive, pending excluded.
        self.assertEqual(s["wins"], 2)
        self.assertEqual(s["losses"], 1)
        self.assertEqual(s["pending"], 2)
        self.assertEqual(s["decisive"], 3)
        # 2/3 = 0.6667
        self.assertAlmostEqual(s["hitRate"], 2 / 3, places=3)

    def test_pushes_excluded_from_hit_rate(self):
        slips = [
            _slip(status="win"),
            _slip(status="loss"),
            _slip(status="push"),
        ]
        a = audit("2026-05-25", graded=_graded(slips))
        s = a["summary"]
        # 1W + 1L = 2 decisive, push excluded.
        self.assertEqual(s["pushes"], 1)
        self.assertEqual(s["decisive"], 2)
        self.assertAlmostEqual(s["hitRate"], 0.5, places=3)


# ---------------------------------------------------------------------------
# Profile derivation
# ---------------------------------------------------------------------------


class ProfileDerivationTests(unittest.TestCase):

    def test_explicit_profile_used_when_present(self):
        slip = _slip(profile="star_power", slip_id="opt_2026-05-25_conservative_x")
        # Explicit field wins over slipId.
        self.assertEqual(_profile_for_slip(slip), "star_power")

    def test_profile_falls_back_to_slip_id(self):
        # Drop the explicit profile to force the fallback parser.
        slip = _slip(profile="balanced", slip_id="opt_2026-05-25_aggressive_abc123")
        slip.pop("profile")
        self.assertEqual(_profile_for_slip(slip), "aggressive")

    def test_unknown_profile_never_silently_promoted(self):
        slip = {"slipId": "opt_2026-05-25_weird_x", "legs": []}
        self.assertEqual(_profile_for_slip(slip), "unknown")

    def test_by_profile_keys_always_present(self):
        # Even if no slips for a profile, the named PROFILES still
        # exist in the output so the consumer can rely on the key set.
        a = audit("2026-05-25", graded=_graded([_slip(profile="conservative")]))
        for prof in PROFILES:
            self.assertIn(prof, a["byProfile"],
                f"named profile {prof} must always exist")


# ---------------------------------------------------------------------------
# Sport bucket detection
# ---------------------------------------------------------------------------


class SportBucketTests(unittest.TestCase):

    def test_mixed_detected_via_multi(self):
        slips = [
            _slip(sport="multi", status="loss",
                  legs=[_leg(sport="nba"), _leg(sport="mlb")]),
            _slip(sport="multi", status="loss",
                  legs=[_leg(sport="nba"), _leg(sport="mlb")]),
            _slip(sport="multi", status="win",
                  legs=[_leg(sport="nba"), _leg(sport="mlb")]),
            _slip(sport="nba", status="win"),
        ]
        a = audit("2026-05-25", graded=_graded(slips))
        ms = a["mixedSport"]
        self.assertEqual(ms["wins"], 1)
        self.assertEqual(ms["losses"], 2)
        self.assertEqual(ms["decisive"], 3)
        # NBA-only slip should NOT be counted as mixed.
        self.assertEqual(a["bySportBucket"]["nba"]["wins"], 1)

    def test_nba_containing_includes_mixed(self):
        slips = [
            _slip(sport="nba", status="win"),
            _slip(sport="multi", status="loss",
                  legs=[_leg(sport="nba"), _leg(sport="mlb")]),
            _slip(sport="mlb", status="win",
                  legs=[_leg(sport="mlb"), _leg(sport="mlb")]),
        ]
        a = audit("2026-05-25", graded=_graded(slips))
        nba_c = a["bySportBucket"]["nbaContaining"]
        # nba-only + multi (any NBA leg) = 2 slips, 1W 1L.
        self.assertEqual(nba_c["wins"], 1)
        self.assertEqual(nba_c["losses"], 1)
        mlb_c = a["bySportBucket"]["mlbContaining"]
        # multi + mlb-only = 2 slips, 1W 1L.
        self.assertEqual(mlb_c["wins"], 1)
        self.assertEqual(mlb_c["losses"], 1)


# ---------------------------------------------------------------------------
# Same-game NBA
# ---------------------------------------------------------------------------


class SameGameNbaTests(unittest.TestCase):

    def test_same_game_nba_includes_multi_with_nba_leg(self):
        slips = [
            # Pure same-game NBA stack.
            _slip(sport="nba", status="loss", same_game=True),
            # Multi-sport same-game with NBA leg — counts.
            _slip(sport="multi", status="loss", same_game=True,
                  legs=[_leg(sport="nba"), _leg(sport="mlb")]),
            # Multi-sport same-game but NO NBA legs — does NOT count.
            _slip(sport="multi", status="loss", same_game=True,
                  legs=[_leg(sport="mlb"), _leg(sport="mlb")]),
            # Cross-game NBA — not same-game.
            _slip(sport="nba", status="win", same_game=False),
        ]
        sg_nba = [s for s in slips if _is_same_game_nba(s)]
        self.assertEqual(len(sg_nba), 2, "first two slips should count")
        a = audit("2026-05-25", graded=_graded(slips))
        self.assertEqual(a["sameGameNba"]["losses"], 2)
        self.assertEqual(a["sameGameNba"]["decisive"], 2)


# ---------------------------------------------------------------------------
# Slip size + market + player + team
# ---------------------------------------------------------------------------


class BucketCountTests(unittest.TestCase):

    def test_by_slip_size(self):
        two_leg = _slip(legs=[_leg(), _leg(player="B")])
        three_leg = _slip(legs=[_leg(), _leg(player="B"), _leg(player="C")])
        a = audit("2026-05-25", graded=_graded([two_leg, three_leg]))
        self.assertIn("2", a["bySlipSize"])
        self.assertIn("3", a["bySlipSize"])
        self.assertEqual(a["bySlipSize"]["2"]["wins"], 1)
        self.assertEqual(a["bySlipSize"]["3"]["wins"], 1)

    def test_by_market_counts_leg_level(self):
        slips = [
            _slip(legs=[
                _leg(market="PTS", result="win"),
                _leg(market="AST", result="loss", player="B"),
            ]),
            _slip(legs=[
                _leg(market="PTS", result="loss"),
                _leg(market="AST", result="loss", player="B"),
            ]),
        ]
        a = audit("2026-05-25", graded=_graded(slips))
        # PTS: 1W + 1L
        self.assertEqual(a["byMarket"]["PTS"]["wins"], 1)
        self.assertEqual(a["byMarket"]["PTS"]["losses"], 1)
        # AST: 0W + 2L
        self.assertEqual(a["byMarket"]["AST"]["wins"], 0)
        self.assertEqual(a["byMarket"]["AST"]["losses"], 2)

    def test_by_player_excludes_unresolved(self):
        # Player C has only an unresolved leg — should NOT appear in
        # byPlayer (zero decisive).
        slips = [
            _slip(legs=[
                _leg(player="Star", result="win"),
                _leg(player="Star", result="loss"),  # same player twice
                _leg(player="Bench", result="unresolved"),
            ]),
        ]
        a = audit("2026-05-25", graded=_graded(slips))
        self.assertIn("Star", a["byPlayer"])
        self.assertEqual(a["byPlayer"]["Star"]["wins"], 1)
        self.assertEqual(a["byPlayer"]["Star"]["losses"], 1)
        self.assertNotIn("Bench", a["byPlayer"],
            "unresolved-only player must not appear")

    def test_by_team_aggregates(self):
        slips = [
            _slip(legs=[
                _leg(team="NYK", result="win"),
                _leg(team="NYK", result="loss"),
                _leg(team="BOS", result="win"),
            ]),
        ]
        a = audit("2026-05-25", graded=_graded(slips))
        self.assertEqual(a["byTeam"]["NYK"]["wins"], 1)
        self.assertEqual(a["byTeam"]["NYK"]["losses"], 1)
        self.assertEqual(a["byTeam"]["BOS"]["wins"], 1)


# ---------------------------------------------------------------------------
# Near misses
# ---------------------------------------------------------------------------


class NearMissTests(unittest.TestCase):

    def test_near_miss_one_loss_no_unresolved(self):
        slip = _slip(status="loss", legs=[
            _leg(player="A", result="win"),
            _leg(player="B", result="win"),
            _leg(player="C", result="loss"),
        ])
        self.assertTrue(_is_near_miss(slip))

    def test_two_losses_not_near_miss(self):
        slip = _slip(status="loss", legs=[
            _leg(player="A", result="loss"),
            _leg(player="B", result="loss"),
            _leg(player="C", result="win"),
        ])
        self.assertFalse(_is_near_miss(slip))

    def test_unresolved_excludes_from_near_miss(self):
        # 1 loss + 1 unresolved → not a near miss (we can't honestly
        # say "would have hit but for one leg").
        slip = _slip(status="loss", legs=[
            _leg(player="A", result="win"),
            _leg(player="B", result="loss"),
            _leg(player="C", result="unresolved"),
        ])
        self.assertFalse(_is_near_miss(slip))

    def test_win_slip_never_near_miss(self):
        slip = _slip(status="win", legs=[
            _leg(player="A", result="win"),
        ])
        self.assertFalse(_is_near_miss(slip))

    def test_near_miss_count_in_audit(self):
        slips = [
            # Near miss.
            _slip(status="loss", legs=[
                _leg(player="A", result="win"),
                _leg(player="B", result="loss"),
            ]),
            # Not a near miss — 2 losses.
            _slip(status="loss", legs=[
                _leg(player="A", result="loss"),
                _leg(player="B", result="loss"),
            ]),
        ]
        a = audit("2026-05-25", graded=_graded(slips))
        self.assertEqual(a["nearMisses"]["count"], 1)
        self.assertEqual(len(a["nearMisses"]["slips"]), 1)
        self.assertEqual(a["nearMisses"]["slips"][0]["losingLeg"]["playerName"], "B")


# ---------------------------------------------------------------------------
# DNP / unavailable
# ---------------------------------------------------------------------------


class DnpUnavailableTests(unittest.TestCase):

    def test_dnp_count_only_pending_slips(self):
        # Slip 1: pending with an unresolved leg → counts.
        # Slip 2: loss with unresolved + losing leg → does NOT count
        #   (the slip's outcome was determined by the losing leg).
        # Slip 3: clean win → does not count.
        slips = [
            _slip(status="pending", legs=[
                _leg(player="DnpGuy", result="unresolved"),
                _leg(player="Other", result="win"),
            ]),
            _slip(status="loss", legs=[
                _leg(player="DnpGuy2", result="unresolved"),
                _leg(player="Other", result="loss"),
            ]),
            _slip(status="win", legs=[
                _leg(player="Other", result="win"),
            ]),
        ]
        a = audit("2026-05-25", graded=_graded(slips))
        self.assertEqual(a["dnpUnavailable"]["count"], 1)
        # Player list still informative — includes both DNP players,
        # not just the one that left a slip pending.
        names = {p["playerName"] for p in a["dnpUnavailable"]["players"]}
        self.assertIn("DnpGuy", names)
        self.assertIn("DnpGuy2", names)

    def test_stats_unavailable_counts_as_unresolved(self):
        slips = [
            _slip(status="pending", legs=[
                _leg(player="X", result="stats_unavailable"),
                _leg(player="Y", result="win"),
            ]),
        ]
        a = audit("2026-05-25", graded=_graded(slips))
        self.assertEqual(a["dnpUnavailable"]["count"], 1)
        self.assertEqual(
            a["dnpUnavailable"]["players"][0]["result"], "stats_unavailable",
        )


# ---------------------------------------------------------------------------
# Recommendation gating
# ---------------------------------------------------------------------------


class RecommendationTests(unittest.TestCase):

    def test_mixed_sport_warning_fires_when_threshold_met(self):
        # 10 mixed-sport losses, 0 wins → 0% on 10 decisive.
        slips = [
            _slip(sport="multi", status="loss",
                  legs=[_leg(sport="nba"), _leg(sport="mlb")])
            for _ in range(10)
        ]
        a = audit("2026-05-25", graded=_graded(slips))
        rec_ids = {r["id"] for r in a["recommendations"]}
        self.assertIn("mixed_sport_downrank", rec_ids)

    def test_mixed_sport_warning_does_not_fire_below_threshold(self):
        # 5 mixed losses is below the decisive >= 10 threshold —
        # sparse-slate guard.
        slips = [
            _slip(sport="multi", status="loss",
                  legs=[_leg(sport="nba"), _leg(sport="mlb")])
            for _ in range(5)
        ]
        a = audit("2026-05-25", graded=_graded(slips))
        rec_ids = {r["id"] for r in a["recommendations"]}
        self.assertNotIn("mixed_sport_downrank", rec_ids)

    def test_market_warning_requires_5_decisive(self):
        # 4 losses on AST is below threshold; 5 fires.
        slips_4 = [_slip(legs=[_leg(market="AST", result="loss")]) for _ in range(4)]
        rec_ids_4 = {
            r["id"] for r in audit("2026-05-25", graded=_graded(slips_4))["recommendations"]
        }
        self.assertNotIn("market_AST_weak", rec_ids_4)
        slips_5 = [_slip(legs=[_leg(market="AST", result="loss")]) for _ in range(5)]
        rec_ids_5 = {
            r["id"] for r in audit("2026-05-25", graded=_graded(slips_5))["recommendations"]
        }
        self.assertIn("market_AST_weak", rec_ids_5)

    def test_longshot_fires_only_with_zero_wins(self):
        # 10 aggressive losses + 0 wins → fires.
        slips_loss = [
            _slip(profile="aggressive", status="loss") for _ in range(10)
        ]
        rec_ids = {
            r["id"] for r in audit("2026-05-25", graded=_graded(slips_loss))["recommendations"]
        }
        self.assertIn("longshot_keep_collapsed", rec_ids)
        # Add even one win → suppress.
        slips_mixed = slips_loss + [_slip(profile="aggressive", status="win")]
        rec_ids_mixed = {
            r["id"] for r in audit("2026-05-25", graded=_graded(slips_mixed))["recommendations"]
        }
        self.assertNotIn("longshot_keep_collapsed", rec_ids_mixed)

    def test_dnp_warning_fires_at_five(self):
        slips = [
            _slip(status="pending", legs=[
                _leg(player=f"Dnp{i}", result="unresolved"),
                _leg(player="Other", result="win"),
            ])
            for i in range(5)
        ]
        rec_ids = {
            r["id"] for r in audit("2026-05-25", graded=_graded(slips))["recommendations"]
        }
        self.assertIn("dnp_guard_strengthen", rec_ids)


# ---------------------------------------------------------------------------
# Missing input
# ---------------------------------------------------------------------------


class MissingInputTests(unittest.TestCase):

    def test_missing_graded_file_returns_empty_with_warning(self):
        # `graded=None` and the underlying file won't exist for a date
        # like 1999-01-01.
        a = audit("1999-01-01")
        self.assertEqual(a["summary"]["totalSlips"], 0)
        self.assertEqual(a["summary"]["wins"], 0)
        # Warning should specifically call out the missing file.
        self.assertTrue(
            any("optimizer-graded file missing" in w for w in a["warnings"]),
            f"expected missing-file warning, got: {a['warnings']}",
        )
        # Empty payload should still have every key the consumer reads.
        for key in (
            "summary", "byProfile", "bySportBucket", "bySlipSize",
            "byMarket", "byPlayer", "byTeam", "sameGameNba", "mixedSport",
            "dnpUnavailable", "nearMisses", "recommendations", "warnings",
        ):
            self.assertIn(key, a, f"empty payload missing key {key}")

    def test_empty_unique_slips_returns_empty_with_warning(self):
        a = audit("2026-05-25", graded={"date": "2026-05-25", "uniqueSlips": []})
        self.assertTrue(
            any("uniqueSlips empty" in w for w in a["warnings"]),
            f"expected empty-slips warning, got: {a['warnings']}",
        )


# ---------------------------------------------------------------------------
# Top losers
# ---------------------------------------------------------------------------


class TopLosersTests(unittest.TestCase):

    def test_top_losing_players_sorted_descending(self):
        slips = [
            _slip(legs=[_leg(player="A", result="loss")]),
            _slip(legs=[_leg(player="A", result="loss")]),
            _slip(legs=[_leg(player="A", result="loss")]),
            _slip(legs=[_leg(player="B", result="loss")]),
            _slip(legs=[_leg(player="C", result="win")]),
        ]
        a = audit("2026-05-25", graded=_graded(slips))
        names = [r["name"] for r in a["topLosingPlayers"]]
        self.assertEqual(names[0], "A", "A has 3 losses, should top")
        self.assertNotIn("C", names, "C has 0 losses, should be omitted")


# ---------------------------------------------------------------------------
# Integration — full audit on a tiny fixture
# ---------------------------------------------------------------------------


class IntegrationTests(unittest.TestCase):

    def test_full_pipeline_round_trip_to_disk(self):
        """Mirrors the CLI: build a small graded fixture, write it,
        run `audit()`, and check the round-tripped JSON is valid.
        """
        with tempfile.TemporaryDirectory() as td:
            graded_path = Path(td) / "2026-05-25.json"
            graded_path.write_text(json.dumps(_graded([
                _slip(status="win", profile="conservative"),
                _slip(status="loss", profile="balanced"),
                _slip(status="pending", profile="star_power",
                      legs=[_leg(result="unresolved"), _leg(result="win", player="B")]),
            ])))
            payload = audit("2026-05-25",
                            graded=json.loads(graded_path.read_text()))
            # Round-trip the payload through JSON so we know it
            # serializes cleanly.
            roundtrip = json.loads(json.dumps(payload))
            self.assertEqual(roundtrip["summary"]["wins"], 1)
            self.assertEqual(roundtrip["summary"]["losses"], 1)
            self.assertEqual(roundtrip["summary"]["pending"], 1)
            self.assertEqual(roundtrip["dnpUnavailable"]["count"], 1)


if __name__ == "__main__":
    unittest.main()
