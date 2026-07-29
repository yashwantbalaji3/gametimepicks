"""Sprint 045 — settlement lineage enforcement tests.

Cases come from the real Sprint 044 audit rather than invention: the 2026-07-22 PIT @ NYY doubleheader
whose game-1 predictions were settled against game 2's box score (44 gradable legs, 27 with a wrong
recorded outcome), and the 2026-05-23 CIN/STL pair.

The mutation test at the bottom rewrites the shipped source on disk, proves the gate stops catching the
regression it exists to catch, restores, and asserts SHA-256 byte-identity.

Run:
    PYTHONPATH=. python3 -m pipeline.mlb.settlement_lineage_test
"""
from __future__ import annotations

import hashlib
import importlib
import pathlib
import sys

import pipeline.mlb.settlement_lineage as sl
from pipeline.mlb.settlement_lineage import derive_event_id, validate_settlement_lineage

# NOTE: the gate is reached through `sl.` rather than imported by name. The mutation test reloads the
# module, which rebinds SettlementLineageError to a NEW class object — a stale `from`-import would stop
# matching in `except` and the tests would pass for the wrong reason. Same trap as Sprint 043.

FAILURES: list[str] = []

GAME_1 = "2026-07-22T17:05:00Z"
GAME_2 = "2026-07-22T23:05:00Z"
EVENT_1 = "mlb:new-york-yankees-v-pittsburgh-pirates:20260722t1705"
EVENT_2 = "mlb:new-york-yankees-v-pittsburgh-pirates:20260722t2305"


def check(cond: bool, msg: str) -> None:
    if not cond:
        FAILURES.append(msg)


def row(**over) -> dict:
    base = {
        "id": "pred-1",
        "eventId": EVENT_1,
        "providerEventId": "8291188eca889695",
        "gamePk": 823518,
        "marketKey": "batter_hits",
        "outcome": "Win",
        "settlementSource": "mlb-statsapi-boxscore",
        "settledAt": "2026-07-23T04:00:00Z",
        "eventStartTime": GAME_1,
    }
    base.update(over)
    return base


# ── the regression case ────────────────────────────────────────────────────────

def test_the_49_bad_legs_shape_is_refused() -> None:
    """One provider id settled against two events — the exact 2026-07-22 defect."""
    rows = [
        row(id="pred-g1", eventId=EVENT_1, providerEventId="823519", gamePk=823518),
        row(id="pred-g2", eventId=EVENT_2, providerEventId="823519", gamePk=823519,
            eventStartTime=GAME_2),
    ]
    v = validate_settlement_lineage(rows)
    check(any("DUPLICATE_MAPPING" in x for x in v), f"expected DUPLICATE_MAPPING, got {v}")
    check(any("823519" in x for x in v), "the message must name the colliding provider id")

    raised = False
    try:
        sl.assert_settlement_lineage(rows, date="2026-07-22")
    except sl.SettlementLineageError as exc:
        raised = True
        check("823519" in str(exc), "the raised error must be actionable")
    check(raised, "the gate MUST refuse, not warn")


def test_THE_REAL_SHAPE_same_gamepk_two_distinct_events() -> None:
    """The shape the real 2026-07-22 board actually has.

    Both halves derive CORRECT, distinct eventIds (start time separates them) and carry distinct
    odds-provider ids — so every alias check passes. Only gamePk injectivity catches it. This case was
    found by running the gate against the committed board rather than a fixture, and it is the reason
    fixtures alone are not enough.
    """
    rows = [
        row(id="g1", eventId=EVENT_1, providerEventId="alias-1", gamePk=823519),
        row(id="g2", eventId=EVENT_2, providerEventId="alias-2", gamePk=823519,
            eventStartTime=GAME_2),
    ]
    v = validate_settlement_lineage(rows)
    check(any("WRONG_EVENT_MAPPING" in x for x in v), f"expected WRONG_EVENT_MAPPING, got {v}")
    check(not any("DUPLICATE_MAPPING" in x for x in v),
          "the alias checks genuinely do NOT fire on this shape — that is the point")
    check(any("823519" in x for x in v), "the message must name the shared gamePk")


def test_real_collided_boards_are_refused_and_clean_boards_pass() -> None:
    """Run the gate over the committed boards. The verdicts must match the Sprint 043 audit exactly."""
    import json
    from pipeline.mlb.settle_mlb_results import _lineage_fields

    expected = {"2026-05-23": 1, "2026-07-22": 2, "2026-07-28": 1, "2026-07-27": 0, "2026-06-09": 0}
    root = pathlib.Path(__file__).resolve().parents[2] / "app/public/data/mlb/boards"
    for date, want in expected.items():
        path = root / f"{date}.json"
        if not path.exists():
            continue
        leans = json.loads(path.read_text()).get("leans") or []
        rows = [
            {**_lineage_fields(l), "id": l.get("id"), "gamePk": l.get("gamePk"),
             "marketKey": l.get("marketKey"), "outcome": "Win",
             "settledAt": "2026-08-01T04:00:00Z"}
            for l in leans
        ]
        got = [x for x in validate_settlement_lineage(rows) if "WRONG_EVENT_MAPPING" in x]
        check(len(got) == want,
              f"{date}: expected {want} collision(s), got {len(got)} — {got[:1]}")


def test_one_event_graded_against_two_gamepks_is_refused() -> None:
    """The collision expressed in settlement's own terms."""
    rows = [
        row(id="a", eventId=EVENT_1, providerEventId="alias-a", gamePk=823518),
        row(id="b", eventId=EVENT_1, providerEventId="alias-a", gamePk=823519),
    ]
    v = validate_settlement_lineage(rows)
    check(any("WRONG_EVENT_MAPPING" in x for x in v), f"expected WRONG_EVENT_MAPPING, got {v}")


def test_one_event_from_two_provider_ids_is_ambiguous() -> None:
    rows = [
        row(id="a", providerEventId="alias-a"),
        row(id="b", providerEventId="alias-b"),
    ]
    v = validate_settlement_lineage(rows)
    check(any("AMBIGUOUS_IDENTITY" in x for x in v), f"expected AMBIGUOUS_IDENTITY, got {v}")


# ── the clean case must stay clean ─────────────────────────────────────────────

def test_a_real_doubleheader_settled_correctly_passes() -> None:
    """Both halves settled to their OWN gamePk is normal and must not trip anything."""
    rows = [
        row(id="g1-a", eventId=EVENT_1, providerEventId="8291188eca889695", gamePk=823518),
        row(id="g1-b", eventId=EVENT_1, providerEventId="8291188eca889695", gamePk=823518),
        row(id="g2-a", eventId=EVENT_2, providerEventId="825819c6eb7f33c3", gamePk=823519,
            eventStartTime=GAME_2),
    ]
    check(validate_settlement_lineage(rows) == [], f"a correct doubleheader must pass: {validate_settlement_lineage(rows)}")


def test_many_rows_per_event_is_normal() -> None:
    rows = [row(id=f"pred-{i}") for i in range(50)]
    check(validate_settlement_lineage(rows) == [], "50 legs on one game must not read as a collision")


# ── structural + timing + source ───────────────────────────────────────────────

def test_each_missing_link_is_named() -> None:
    v = validate_settlement_lineage([row(id="pred-x", settlementSource="", settledAt="")])
    check(len(v) == 1, f"expected a single MISSING_LINEAGE, got {v}")
    check("settlementSource" in v[0] and "settledAt" in v[0], f"must name both fields: {v[0]}")


def test_missing_event_id_is_caught() -> None:
    v = validate_settlement_lineage([row(eventId=None)])
    check(any("MISSING_LINEAGE" in x and "eventId" in x for x in v), f"got {v}")


def test_duplicate_prediction_is_caught() -> None:
    v = validate_settlement_lineage([row(), row(outcome="Loss")])
    check(any("DUPLICATE_PREDICTION" in x for x in v), f"got {v}")


def test_settling_before_the_event_is_impossible() -> None:
    v = validate_settlement_lineage([row(settledAt="2026-07-22T12:00:00Z")])
    check(any("IMPOSSIBLE_RELATIONSHIP" in x for x in v), f"got {v}")
    check(any("did not exist yet" in x for x in v), "the message must say why it is impossible")


def test_untrusted_source_is_refused() -> None:
    for src in ("web-search-snippet", "model-output", "some-new-provider"):
        v = validate_settlement_lineage([row(settlementSource=src)])
        check(any("UNTRUSTED_SOURCE" in x for x in v), f"{src} must be refused, got {v}")


def test_a_malformed_row_does_not_mask_the_others() -> None:
    v = validate_settlement_lineage([row(id="", eventId=""), row(), row()])
    check(any("MISSING_LINEAGE" in x for x in v), "the malformed row must be reported")
    check(any("DUPLICATE_PREDICTION" in x for x in v), "the duplicate pair must still be caught")


# ── event id derivation ────────────────────────────────────────────────────────

def test_derive_event_id_separates_doubleheader_halves() -> None:
    a = derive_event_id(sport="mlb", league="MLB",
                        participant_names=["New York Yankees", "Pittsburgh Pirates"],
                        scheduled_start=GAME_1)
    b = derive_event_id(sport="mlb", league="MLB",
                        participant_names=["New York Yankees", "Pittsburgh Pirates"],
                        scheduled_start=GAME_2)
    check(a != b, "the two halves must derive distinct ids")
    check(a == EVENT_1, f"unexpected id: {a}")
    check(b == EVENT_2, f"unexpected id: {b}")


def test_derive_event_id_is_order_independent() -> None:
    a = derive_event_id(sport="mlb", league="MLB",
                        participant_names=["Pittsburgh Pirates", "New York Yankees"],
                        scheduled_start=GAME_1)
    check(a == EVENT_1, f"argument order must not change the id: {a}")


def test_derive_event_id_handles_missing_start_and_accents() -> None:
    check(derive_event_id(sport="mlb", league="MLB", participant_names=["A", "B"],
                          scheduled_start=None).endswith("unscheduled"),
          "no start -> 'unscheduled', never a guess")
    got = derive_event_id(sport="mlb", league="MLB",
                          participant_names=["Montréal Expos", "Chicago Cubs"],
                          scheduled_start=GAME_1)
    check("montreal-expos" in got, f"accents must fold: {got}")


# ── mutation ───────────────────────────────────────────────────────────────────

def test_MUTATION_removing_the_collision_check_trips_nothing_and_is_restored() -> None:
    """Disable the duplicate-mapping loop in the SHIPPED source; prove the defect passes; restore."""
    src = pathlib.Path(__file__).with_name("settlement_lineage.py")
    original = src.read_bytes()
    digest = hashlib.sha256(original).hexdigest()

    mutated = original.decode().replace(
        "    for alias, events in sorted(by_provider.items()):",
        "    for alias, events in []:  # MUTATION",
        1,
    )
    check(mutated != original.decode(), "mutation did not apply — the source changed shape")

    try:
        src.write_text(mutated)
        importlib.reload(sl)
        rows = [
            {"id": "a", "eventId": EVENT_1, "providerEventId": "823519", "gamePk": 823518,
             "marketKey": "batter_hits", "outcome": "Win",
             "settlementSource": "mlb-statsapi-boxscore", "settledAt": "2026-07-23T04:00:00Z",
             "eventStartTime": GAME_1},
            {"id": "b", "eventId": EVENT_2, "providerEventId": "823519", "gamePk": 823519,
             "marketKey": "batter_hits", "outcome": "Win",
             "settlementSource": "mlb-statsapi-boxscore", "settledAt": "2026-07-23T04:00:00Z",
             "eventStartTime": GAME_2},
        ]
        missed = not any("DUPLICATE_MAPPING" in x for x in sl.validate_settlement_lineage(rows))
        check(missed, "THE MUTATION MUST DEFEAT THE GATE, or this test proves nothing")
    finally:
        src.write_bytes(original)
        importlib.reload(sl)

    check(hashlib.sha256(src.read_bytes()).hexdigest() == digest,
          "the mutated source was NOT restored byte-for-byte")
    restored = sl.validate_settlement_lineage([
        row(id="a", eventId=EVENT_1, providerEventId="823519", gamePk=823518),
        row(id="b", eventId=EVENT_2, providerEventId="823519", gamePk=823519,
            eventStartTime=GAME_2),
    ])
    check(any("DUPLICATE_MAPPING" in x for x in restored),
          "the restored module must catch the defect again")


def test_MUTATION_removing_the_required_field_check_hides_missing_lineage() -> None:
    src = pathlib.Path(__file__).with_name("settlement_lineage.py")
    original = src.read_bytes()
    digest = hashlib.sha256(original).hexdigest()
    mutated = original.decode().replace("        if missing:", "        if False:", 1)
    check(mutated != original.decode(), "mutation did not apply")

    try:
        src.write_text(mutated)
        importlib.reload(sl)
        v = sl.validate_settlement_lineage([{"id": "p"}])
        check(not any("MISSING_LINEAGE" in x for x in v), "the mutation must defeat the gate")
    finally:
        src.write_bytes(original)
        importlib.reload(sl)

    check(hashlib.sha256(src.read_bytes()).hexdigest() == digest, "source NOT restored byte-for-byte")
    check(any("MISSING_LINEAGE" in x for x in sl.validate_settlement_lineage([{"id": "p"}])),
          "the restored module must catch it again")


def main() -> int:
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
    if FAILURES:
        print(f"FAIL — {len(FAILURES)} assertion(s):")
        for f in FAILURES:
            print(f"  - {f}")
        return 1
    print(f"ok — {len(tests)} settlement lineage tests passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
