"""
Tests for pipeline.player_resolver.

Run from repo root:  python3 -m pipeline.player_resolver_test

Pass criteria: prints "ALL TESTS PASSED" and exits 0.
"""
from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

from pipeline.player_resolver import (
    normalize_name,
    resolve_player_id,
    _load_static_index,
    reset_caches,
)


PASS, FAIL = 0, 0


def t(label: str, actual, expected):
    global PASS, FAIL
    if actual == expected:
        PASS += 1
        print(f"  PASS  {label}")
    else:
        FAIL += 1
        print(f"  FAIL  {label}")
        print(f"        expected: {expected!r}")
        print(f"        actual:   {actual!r}")


def section(name):
    print(f"\n--- {name} ---")


section("normalize_name")
t("lowercase",                 normalize_name("ANTHONY EDWARDS"),   "anthony edwards")
t("strip accent (Doncic)",     normalize_name("Luka Don\u010di\u0107"), "luka doncic")
t("curly apostrophe -> straight", normalize_name("De\u2019Aaron Fox"), "de'aaron fox")
t("straight apostrophe kept",  normalize_name("De'Aaron Fox"),      "de'aaron fox")
t("hyphen removed",            normalize_name("Karl-Anthony Towns"), "karlanthony towns")
t("trailing period removed",   normalize_name("Tim Hardaway Jr."),  "tim hardaway jr")
t("suffix kept (no period)",   normalize_name("Tim Hardaway Jr"),   "tim hardaway jr")
t("plain no suffix",           normalize_name("Tim Hardaway"),      "tim hardaway")
t("internal punct removed",    normalize_name("D'Angelo Russell"),  "d'angelo russell")
t("whitespace collapsed",      normalize_name("  Anthony   Edwards "), "anthony edwards")
t("empty string",              normalize_name(""),                  "")
t("only punctuation",          normalize_name("---"),               "")

section("resolve_player_id - known problem cases")
t("De'Aaron Fox resolves",     resolve_player_id("De'Aaron Fox"),     (1628368, "exact"))
t("De'Aaron Fox curly apo",    resolve_player_id("De\u2019Aaron Fox"), (1628368, "exact"))
t("Stephon Castle resolves",   resolve_player_id("Stephon Castle"),   (1642264, "exact"))
t("Anthony Edwards resolves",  resolve_player_id("Anthony Edwards"),  (1630162, "exact"))
t("Edwards != Jalen Green",
  resolve_player_id("Anthony Edwards")[0] != 1630224,
  True)

section("resolve_player_id - diacritic / apostrophe variants")
t("Luka with diacritic",       resolve_player_id("Luka Don\u010di\u0107"), (1629029, "exact"))
t("Luka without diacritic",    resolve_player_id("Luka Doncic"),      (1629029, "exact"))
t("Karl-Anthony Towns",        resolve_player_id("Karl-Anthony Towns"), (1626157, "exact"))
t("Karl Anthony Towns no hyphen", resolve_player_id("Karl Anthony Towns"), (0, "unknown"))

section("resolve_player_id - suffix safety")
sr_id, _ = resolve_player_id("Tim Hardaway")
jr_id, _ = resolve_player_id("Tim Hardaway Jr.")
t("Tim Hardaway Sr only matches retired (returns 0)", sr_id, 0)
t("Tim Hardaway Jr. has its own ID",                  jr_id, 203501)
t("Jr.  and (no period) Jr resolve identically",
  resolve_player_id("Tim Hardaway Jr"),
  resolve_player_id("Tim Hardaway Jr."))

section("resolve_player_id - failure modes")
t("empty string",              resolve_player_id(""),                  (0, "unknown"))
t("garbage name",              resolve_player_id("ZZZ_NOT_A_PLAYER"),  (0, "unknown"))
t("punctuation only",          resolve_player_id("---"),               (0, "unknown"))
t("Never returns None",        resolve_player_id("anything")[0] is not None, True)

section("alias file")
with tempfile.TemporaryDirectory() as td:
    alias_path = Path(td) / "aliases.json"
    alias_path.write_text(json.dumps({
        "aliases": {
            "Fake Test Player": 9999999,
            "Test O\u2019Curly": 8888888,
        }
    }))
    reset_caches()
    t("alias lookup hits",
      resolve_player_id("Fake Test Player", alias_path=alias_path),
      (9999999, "alias"))
    t("alias key with curly apostrophe matches straight input",
      resolve_player_id("Test O'Curly", alias_path=alias_path),
      (8888888, "alias"))
    t("alias key normalized same direction as input",
      resolve_player_id("test o'curly", alias_path=alias_path),
      (8888888, "alias"))
reset_caches()

section("static index hygiene")
idx = _load_static_index()
t("active map populated", len(idx["active"]) > 400, True)
t("active map < 600",     len(idx["active"]) < 600, True)
t("zero active collisions", len(idx["active_collisions"]), 0)

section("coverage projection against real May 12 names")
sample_unresolved = [
    "Stephon Castle", "De'Aaron Fox", "Anthony Edwards",
    "Karl-Anthony Towns", "Luka Don\u010di\u0107", "Julius Randle",
    "Rudy Gobert", "Jaden McDaniels", "Devin Vassell",
]
resolved = sum(1 for n in sample_unresolved if resolve_player_id(n)[0] > 0)
print(f"  {resolved} / {len(sample_unresolved)} sample names resolve to non-zero")
t("sample coverage >= 80%", resolved >= int(len(sample_unresolved) * 0.8), True)

print(f"\n{'=' * 50}")
print(f"PASS: {PASS}    FAIL: {FAIL}")
print(f"{'=' * 50}")
if FAIL:
    print("TESTS FAILED")
    sys.exit(1)
print("ALL TESTS PASSED")
sys.exit(0)
