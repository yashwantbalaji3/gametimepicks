"""Tests for pipeline.mlb.capture_game_logs (MS-2a). Offline: saved fixtures only, no network.

Run: PYTHONPATH=. python3 -m pipeline.mlb.capture_game_logs_test
"""
from __future__ import annotations

import json
import pathlib
import sys
import tempfile

from . import capture_game_logs as C

FX = pathlib.Path(__file__).resolve().parent / "fixtures" / "game_logs"
AT1 = "2026-09-21T14:30:00Z"
AT2 = "2026-09-22T14:30:00Z"


def _sched(name: str):
    payload = json.loads((FX / name).read_text())
    return lambda date: [g for d in payload["dates"] if d["date"] == date for g in d["games"]]


def _box(pk: int) -> dict:
    f = FX / f"boxscore-{pk}.json"
    if not f.exists():
        raise FileNotFoundError(f"no box {pk}")
    return json.loads(f.read_text())


def _ok(msg: str) -> None:
    print(f"  \033[0;32m✓\033[0m {msg}")


def test_outs_from_innings() -> None:
    assert C.outs_from_innings("5.2") == 17
    assert C.outs_from_innings("6.0") == 18
    assert C.outs_from_innings("0.1") == 1
    assert C.outs_from_innings("7") == 21
    assert C.outs_from_innings("5.3") is None, "the decimal is thirds; .3 is malformed, not 6 innings"
    assert C.outs_from_innings(None) is None and C.outs_from_innings("-") is None
    _ok("innings pitched → outs uses thirds and refuses malformed values")


def test_classify_and_scope() -> None:
    fresh = C.capture_date("2026-09-20", _sched("schedule-2026-09-20.json"), _box, AT1)
    pks = {g["gamePk"] for g in fresh["games"]}
    assert pks == {900001}, pks
    gaps = {(x["gamePk"], x["reason"]) for x in fresh["gaps"]}
    assert gaps == {(900002, "BOXSCORE_UNAVAILABLE"), (900004, "NOT_FINAL_AT_CAPTURE")}, gaps
    assert [n["gamePk"] for n in fresh["notPlayed"]] == [900003], "postponed is not played, not a gap"
    all_pks = pks | {x[0] for x in gaps} | {n["gamePk"] for n in fresh["notPlayed"]}
    assert 900005 not in all_pks, "spring training is out of scope"
    assert 900006 not in all_pks, "a game whose officialDate is another day is captured on that day only"
    for rec in fresh["games"] + fresh["gaps"] + fresh["notPlayed"]:
        assert rec["capturedAt"] == AT1, "every record carries its capture time"
    _ok("final / gap / not-played classification, scope and capturedAt")


def test_box_lines() -> None:
    g = C.capture_date("2026-09-20", _sched("schedule-2026-09-20.json"), _box, AT1)["games"][0]
    away, home = g["away"], g["home"]
    assert (away["teamAbbr"], home["teamAbbr"]) == ("BOS", "NYY")
    names = [b["name"] for b in away["batters"]]
    assert names == ["Away Leadoff", "Away Two", "Away Sub"], f"box batting order kept, bench player with 0 PA dropped: {names}"
    sub = away["batters"][2]
    assert sub["battingOrder"] == "201" and sub["pa"] == 1
    two = away["batters"][1]
    assert (two["hr"], two["tb"], two["rbi"]) == (1, 4, 2)
    st, rel = away["pitchers"]
    assert st["isStarter"] and not rel["isStarter"] and st["appearanceOrder"] == 1
    assert (st["outs"], st["so"], st["er"], st["bf"]) == (17, 7, 2, 24)
    assert rel["outs"] == 7 and rel["er"] == 0, "zero earned runs is a real zero, kept as 0"
    assert home["pitchers"][0]["outs"] == 18
    _ok("batter and pitcher lines, order, starter flag, outs")


def test_missing_is_not_zero() -> None:
    g = C.capture_date("2026-09-20", _sched("schedule-2026-09-20.json"), _box, AT1)["games"][0]
    lead = g["home"]["batters"][0]
    assert lead["tb"] is None, "a field the provider omitted is null, never 0"
    assert lead["missingFields"] == ["tb"], lead["missingFields"]
    assert g["away"]["batters"][0]["missingFields"] == []
    _ok("an omitted stat is null and named in missingFields")


def test_append_only_and_gap_resolution() -> None:
    with tempfile.TemporaryDirectory() as d:
        root = pathlib.Path(d)
        r1 = C.run_date("2026-09-20", root, _sched("schedule-2026-09-20.json"), _box, AT1)
        assert r1["gamesAdded"] == 1 and r1["openGaps"] == [900002, 900004] and not r1["complete"]
        path = C.date_path(root, "2026-09-20")
        first = json.loads(path.read_text())
        assert first["public"] is False and first["productEligible"] is False
        # second run: 900004 is now final; 900002's box is still unavailable
        r2 = C.run_date("2026-09-20", root, _sched("schedule-2026-09-20-later.json"), _box, AT2)
        second = json.loads(path.read_text())
        assert r2["gamesAdded"] == 1 and r2["openGaps"] == [900002]
        assert second["games"][0] == first["games"][0], "the first capture of a game is never rewritten"
        assert second["gaps"][: len(first["gaps"])] == first["gaps"], "old gap entries stay as history"
        assert second["firstCapturedAt"] == AT1 and len(second["runs"]) == 2
        assert [g["gamePk"] for g in second["games"]] == [900001, 900004]
        assert second["games"][1]["capturedAt"] == AT2
        # a box that changed upstream does not change the record
        changed = json.loads(json.dumps(_box(900001)))
        changed["teams"]["away"]["players"]["ID1001"]["stats"]["batting"]["hits"] = 9
        C.run_date("2026-09-20", root, _sched("schedule-2026-09-20-later.json"), lambda pk: changed if pk == 900001 else _box(pk), AT2)
        third = json.loads(path.read_text())
        assert third["games"][0]["away"]["batters"][0]["h"] == 2
    _ok("append-only across runs; gaps resolve by addition, never by edit")


def test_append_only_guard_refuses() -> None:
    before = {"date": "2026-09-20", "source": C.SOURCE, "firstCapturedAt": AT1, "games": [{"gamePk": 1}], "gaps": [], "notPlayed": [], "runs": []}
    after = json.loads(json.dumps(before))
    after["games"][0]["gamePk"] = 2
    try:
        C.assert_append_only(before, after)
    except C.CaptureRefused:
        _ok("a write that changes an existing record is refused")
        return
    raise AssertionError("append-only guard did not refuse")


def test_complete_day_is_skipped_and_cli_offline() -> None:
    with tempfile.TemporaryDirectory() as d:
        rc = C.main(["--date", "2026-09-20", "--fixtures-dir", str(FX), "--out-root", d, "--captured-at", AT1])
        assert rc == 0, "gaps are recorded, not a refusal"
        doc = json.loads(C.date_path(pathlib.Path(d), "2026-09-20").read_text())
        assert doc["openGaps"] == [900002, 900004]
        # an off day (no schedule fixture) is complete with zero games — no fabricated rows
        rc = C.main(["--backfill-start", "2026-09-22", "--backfill-end", "2026-09-23", "--fixtures-dir", str(FX), "--out-root", d, "--captured-at", AT1])
        off = json.loads(C.date_path(pathlib.Path(d), "2026-09-22").read_text())
        assert rc == 0 and off["games"] == [] and off["complete"] is True
        before = C.date_path(pathlib.Path(d), "2026-09-22").read_text()
        C.main(["--date", "2026-09-22", "--fixtures-dir", str(FX), "--out-root", d, "--captured-at", AT2])
        assert C.date_path(pathlib.Path(d), "2026-09-22").read_text() == before, "a complete day is not re-captured"
        # --max-days caps a backfill run
        rc = C.main(["--backfill-start", "2026-09-24", "--backfill-end", "2026-09-30", "--max-days", "2", "--fixtures-dir", str(FX), "--out-root", d, "--captured-at", AT1])
        written = sorted(p.name for p in (pathlib.Path(d) / "2026").glob("2026-09-2*.json"))
        assert "2026-09-26.json" not in written and "2026-09-25.json" in written, written
    _ok("CLI offline run, off days, complete-day skip, --max-days")


def main() -> int:
    tests = [v for k, v in globals().items() if k.startswith("test_") and callable(v)]
    failed = 0
    for t in tests:
        try:
            t()
        except Exception as e:  # report every failure, then exit non-zero
            failed += 1
            print(f"  \033[0;31m✗\033[0m {t.__name__}: {e}")
    print(f"\n{len(tests) - failed} passed, {failed} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
