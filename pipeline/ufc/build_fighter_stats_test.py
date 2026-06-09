"""Tests for build_fighter_stats — fixture CSVs, no network, fail-closed."""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from pipeline.ufc.build_fighter_stats import build
from pipeline.ufc.providers.ufcstats_csv import read_csvs

EVENTS = "EVENT,URL,DATE,LOCATION\nUFC X,u1,\"May 16, 2026\",Vegas\nUFC Y,u2,\"Apr 01, 2026\",Vegas\n"
DETAILS = "FIRST,LAST,NICKNAME,URL\nAlex,Star,The Hammer,d1\nBob,Foe,,d2\n"
TOTT = ("FIGHTER,HEIGHT,WEIGHT,REACH,STANCE,DOB,URL\n"
        "Alex Star,\"6' 0\"\"\",185 lbs.,\"76\"\"\",Orthodox,\"Jan 01, 1995\",t1\n"
        "Bob Foe,--,185 lbs.,--,,\"Jan 01, 1990\",t2\n")
RESULTS = ("EVENT,BOUT,OUTCOME,WEIGHTCLASS,METHOD,ROUND,TIME,TIME FORMAT,REFEREE,DETAILS,URL\n"
           "UFC X ,Alex Star vs. Bob Foe,W/L,Middleweight Bout,KO/TKO,1,1:30,3 Rnd,Ref,d,r1\n"
           "UFC Y ,Alex Star vs. Bob Foe,W/L,Middleweight Bout,Decision - Unanimous,3,5:00,3 Rnd,Ref,d,r2\n")
STATS = ("EVENT,BOUT,ROUND,FIGHTER,KD,SIG.STR.,SIG.STR. %,TOTAL STR.,TD,TD %,SUB.ATT,REV.,CTRL,HEAD,BODY,LEG,DISTANCE,CLINCH,GROUND\n"
         "UFC X,Alex Star vs. Bob Foe,Round 1,Alex Star,1,10 of 20,50%,15 of 25,1 of 2,50%,0,0,1:00,5,3,2,7,2,1\n"
         "UFC X,Alex Star vs. Bob Foe,Round 1,Bob Foe,0,5 of 15,33%,8 of 18,0 of 1,0%,1,0,0:30,3,1,1,4,1,0\n")


def _write(d: Path):
    (d / "ufc_event_details.csv").write_text(EVENTS)
    (d / "ufc_fighter_details.csv").write_text(DETAILS)
    (d / "ufc_fighter_tott.csv").write_text(TOTT)
    (d / "ufc_fight_results.csv").write_text(RESULTS)
    (d / "ufc_fight_stats.csv").write_text(STATS)


class BuildFighterStatsTests(unittest.TestCase):
    def setUp(self):
        self._td = tempfile.TemporaryDirectory()
        _write(Path(self._td.name))
        self.art = build(read_csvs(self._td.name))
        self.by = {f["canonicalName"]: f for f in self.art["fighters"]}

    def tearDown(self):
        self._td.cleanup()

    def test_metadata_and_attribution(self):
        self.assertEqual(self.art["provider"], "greco1899_ufcstats_csv")
        self.assertEqual(self.art["sourceLicense"], "GPL-3.0")
        self.assertIn("ufcstats", self.art["sourceAttribution"].lower())

    def test_record_derived(self):
        a = self.by["Alex Star"]
        self.assertEqual(a["record"], {"wins": 2, "losses": 0, "draws": 0, "nc": 0, "total": 2})
        self.assertEqual(self.by["Bob Foe"]["record"]["losses"], 2)

    def test_finish_breakdown(self):
        a = self.by["Alex Star"]
        self.assertEqual(a["finishes"]["koWins"], 1)
        self.assertEqual(a["finishes"]["decisionWins"], 1)
        self.assertEqual(a["finishes"]["finishRate"], 0.5)

    def test_recent_form_and_latest(self):
        self.assertEqual(self.by["Alex Star"]["recentForm"]["last5"], "2-0")
        self.assertEqual(self.by["Alex Star"]["latestFightDate"], "2026-05-16")

    def test_physicals_parsed_and_missing_handled(self):
        self.assertEqual(self.by["Alex Star"]["physicals"]["heightInches"], 72)
        self.assertEqual(self.by["Alex Star"]["physicals"]["reachInches"], 76.0)
        # Bob Foe has "--" → None, not faked
        self.assertIsNone(self.by["Bob Foe"]["physicals"]["heightInches"])

    def test_rates_aggregated(self):
        a = self.by["Alex Star"]
        self.assertEqual(a["rates"]["avgSigStrLandedPerRound"], 10.0)
        self.assertEqual(a["rates"]["sigStrAccuracy"], 0.5)

    def test_empty_input_fails_closed(self):
        art = build({"ufc_event_details": [], "ufc_fighter_details": [],
                     "ufc_fighter_tott": [], "ufc_fight_results": [], "ufc_fight_stats": []})
        self.assertEqual(art["fighterCount"], 0)
        self.assertEqual(art["fighters"], [])


if __name__ == "__main__":
    unittest.main()
