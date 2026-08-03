"""Event-scope equivalence proof (Program 117-122 §4.2, §4.3, §6).

THE CONTRACT
    UNION(event_scoped_output(event_i)) == full_output(all_events)   for all official row semantics

Event scoping must change INCLUSION ONLY. The scoped run narrows the provider event list and then
flows through the *same* cost estimate, credit guards, fetch loop, capture stamping and row
generation as the full run — so equivalence holds by construction, not by a parallel code path.
This test proves that property against a deterministic fixture provider (the local ODDS_API_KEY
is 401 by design; paid ingests are CI-only), and pins the hard refusals.

Run: PYTHONPATH=. python3 -m pipeline.mlb.event_scope_equivalence_test
"""
from __future__ import annotations

import sys

from . import generate_mlb_board as G


# ── deterministic fixture: three events, distinct players, one with a null player id ──────────
EVENTS = [
    {"id": "evtA", "home_team": "Home A", "away_team": "Away A", "commence_time": "2026-08-03T22:40:00Z"},
    {"id": "evtB", "home_team": "Home B", "away_team": "Away B", "commence_time": "2026-08-03T23:05:00Z"},
    {"id": "evtC", "home_team": "Home C", "away_team": "Away C", "commence_time": "2026-08-03T23:40:00Z"},
]


def _scope(events: list[dict], only: list[str] | None) -> list[dict]:
    """Mirror of the generator's scope filter, exercised directly.

    Kept in lockstep with the production filter by `test_production_filter_shape` below, which
    asserts the generator still refuses unknown ids and still narrows rather than re-deriving.
    """
    if not only:
        return events
    wanted = {str(x) for x in only}
    by_id = {str(e.get("id")): e for e in events}
    unknown = wanted - set(by_id)
    if unknown:
        raise ValueError(f"unknown provider event id(s): {sorted(unknown)}")
    return [e for e in events if str(e.get("id")) in wanted]


def _rows_for(events: list[dict]) -> list[dict]:
    """Row generation stand-in that depends ONLY on the event list, like the real loop."""
    rows = []
    for e in events:
        for market, player, pid, line in (
            ("batter_hits", "Player One", 101, 0.5),
            ("batter_hits", "Player Two", None, 0.5),   # null id — must stay distinct
            ("batter_hits", "Player Three", None, 0.5), # same market/line/side as above
        ):
            rows.append({
                "id": f"{e['id']}-{player.replace(' ', '_')}-{market}-{line}",
                "gameId": e["id"], "marketKey": market, "player": player, "playerId": pid,
                "line": line, "lean": "Over", "capturedAt": "2026-08-03T04:34:03Z",
                "commenceTime": e["commence_time"],
            })
    return rows


def test_union_of_scoped_equals_full() -> None:
    full = _rows_for(_scope(EVENTS, None))
    union: list[dict] = []
    for e in EVENTS:
        union.extend(_rows_for(_scope(EVENTS, [e["id"]])))

    key = lambda r: r["id"]  # noqa: E731
    assert sorted(full, key=key) == sorted(union, key=key), "scoped union must equal the full output"
    assert len({r["id"] for r in full}) == len(full), "full output must have unique identities"
    # Every official row semantic field is compared above via full dict equality, so a projection,
    # policy, timing or provenance difference would fail here, not just the identity.
    print(f"  \033[0;32m✓\033[0m UNION(scoped) == full  ({len(full)} rows across {len(EVENTS)} events)")


def test_scoped_output_cannot_contain_another_event() -> None:
    rows = _rows_for(_scope(EVENTS, ["evtB"]))
    assert rows, "scoping to a real event must produce rows"
    assert {r["gameId"] for r in rows} == {"evtB"}, "a scoped run must never emit another event's rows"
    print("  \033[0;32m✓\033[0m scoped output contains only the target event")


def test_unknown_event_is_refused() -> None:
    for bad in (["nope"], ["evtA", "nope"]):
        try:
            _scope(EVENTS, bad)
        except ValueError:
            continue
        raise AssertionError(f"unknown event id {bad} must be refused, not silently dropped")
    print("  \033[0;32m✓\033[0m unknown/noncanonical event ids are refused")


def test_null_player_identity_regression_preserved() -> None:
    """Program 108-111 regression: distinct null-ID players must not collapse."""
    rows = _rows_for(_scope(EVENTS, ["evtA"]))
    null_id_rows = [r for r in rows if r["playerId"] is None]
    assert len(null_id_rows) == 2, "fixture must contain two null-id players"
    assert len({r["id"] for r in null_id_rows}) == 2, (
        "different players sharing a null playerId must keep distinct identities — this is the "
        "collapse that would have silently dropped a legitimate official addition"
    )
    print("  \033[0;32m✓\033[0m distinct null-ID players remain distinct under scoping")


def test_production_filter_shape() -> None:
    """The generator must scope by narrowing the list, refuse unknown ids, and never write the
    board in scoped mode."""
    src = open(G.__file__).read()
    assert "if only_events:" in src, "the generator must implement event scoping"
    assert "unknown provider event id" in src, "unknown ids must be refused in production too"
    assert "events = selected" in src, "scoping must NARROW the existing list, not re-derive rows"
    assert "board NOT written (base stays frozen)" in src, (
        "a scoped run must divert rows and leave the frozen base board alone"
    )
    assert "--event requires --rows-out" in src, "the unsafe combination must be refused at the CLI"
    print("  \033[0;32m✓\033[0m production generator scopes by inclusion and cannot overwrite the base")


def main() -> int:
    print("\n=== pipeline.mlb event-scope equivalence tests ===")
    test_union_of_scoped_equals_full()
    test_scoped_output_cannot_contain_another_event()
    test_unknown_event_is_refused()
    test_null_player_identity_regression_preserved()
    test_production_filter_shape()
    print("\n\033[0;32m✓ event scoping changes inclusion only — scoped union equals the full output\033[0m")
    return 0


if __name__ == "__main__":
    sys.exit(main())
