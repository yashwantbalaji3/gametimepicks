"""
Phase 15 — pipeline.active_slate_test

Regression tests for the active-slate selector. Mirrors the rules in
`app/src/lib/active-slate.ts` so the Python suite can lock the contract.

Hard rules being enforced:
  - May 5 board viewed on May 7 must NOT be the active slate.
  - Past-only data produces "no_current" with archive surfaced.
  - Future-only data picks nearest upcoming.
  - Today's board (even empty) wins over past data.

Zero network. Zero filesystem mutation.
"""
from __future__ import annotations


# ---------------------------------------------------------------------------
# Python port of selectActiveSlate (must mirror active-slate.ts)
# ---------------------------------------------------------------------------

def select_active_slate(
    available_dates: list[str],
    today: str,
    boards_by_date: dict | None = None,
) -> dict:
    """Mirror of selectActiveSlate()."""
    boards = boards_by_date or {}

    past: list[str] = []
    today_match: list[str] = []
    future: list[str] = []

    for d in available_dates:
        if d < today:
            past.append(d)
        elif d == today:
            today_match.append(d)
        else:
            future.append(d)

    upcoming = sorted(today_match + future)
    past_dates = sorted(past, reverse=True)  # newest past first

    latest_archived = next(
        (d for d in past_dates if len((boards.get(d) or {}).get("leans") or []) > 0),
        past_dates[0] if past_dates else None,
    )

    if not available_dates:
        return {
            "kind": "no_data",
            "selectedDate": None,
            "upcomingAndTodayDates": [],
            "pastDates": [],
            "latestArchivedDate": None,
        }

    if today_match:
        return {
            "kind": "today",
            "selectedDate": today,
            "upcomingAndTodayDates": upcoming,
            "pastDates": past_dates,
            "latestArchivedDate": latest_archived,
        }

    if future:
        future_with_leans = next(
            (d for d in future if len((boards.get(d) or {}).get("leans") or []) > 0),
            None,
        )
        return {
            "kind": "upcoming",
            "selectedDate": future_with_leans or future[0],
            "upcomingAndTodayDates": upcoming,
            "pastDates": past_dates,
            "latestArchivedDate": latest_archived,
        }

    return {
        "kind": "no_current",
        "selectedDate": None,
        "upcomingAndTodayDates": [],
        "pastDates": past_dates,
        "latestArchivedDate": latest_archived,
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def main() -> int:
    asserts = 0

    # ── Test 1: empty input → no_data ─────────────────────────────────────
    r = select_active_slate([], "2026-05-07")
    assert r["kind"] == "no_data"
    assert r["selectedDate"] is None
    assert r["upcomingAndTodayDates"] == []
    assert r["pastDates"] == []
    asserts += 4

    # ── Test 2: today exists with content → today ─────────────────────────
    r = select_active_slate(
        ["2026-05-06", "2026-05-07", "2026-05-08"],
        "2026-05-07",
        {"2026-05-07": {"leans": [{"id": 1}]}},
    )
    assert r["kind"] == "today"
    assert r["selectedDate"] == "2026-05-07"
    assert r["upcomingAndTodayDates"] == ["2026-05-07", "2026-05-08"]
    assert r["pastDates"] == ["2026-05-06"]
    asserts += 4

    # ── Test 3: today exists but EMPTY → still today (better than past) ──
    r = select_active_slate(
        ["2026-05-05", "2026-05-07"],
        "2026-05-07",
        {
            "2026-05-05": {"leans": [{"id": 1}, {"id": 2}]},  # past has data
            "2026-05-07": {"leans": []},  # today is empty
        },
    )
    assert r["kind"] == "today", "Empty today must still win over past with data"
    assert r["selectedDate"] == "2026-05-07"
    assert r["latestArchivedDate"] == "2026-05-05"
    asserts += 3

    # ── Test 4: THE BUG — May 5 viewed on May 7 must NOT be active ───────
    # This is the exact bug Phase 15 is fixing. Available dates are 04
    # through 09; today is 07. May 5 has 24 leans (the most). Must NOT
    # be the active slate just because it has the most data.
    r = select_active_slate(
        ["2026-05-04", "2026-05-05", "2026-05-06", "2026-05-07",
         "2026-05-08", "2026-05-09"],
        "2026-05-07",
        {
            "2026-05-04": {"leans": []},
            "2026-05-05": {"leans": [{"id": i} for i in range(24)]},
            "2026-05-06": {"leans": []},
            "2026-05-07": {"leans": []},
            "2026-05-08": {"leans": []},
            "2026-05-09": {"leans": []},
        },
    )
    assert r["kind"] == "today"
    assert r["selectedDate"] == "2026-05-07", \
        f"BUG: selected {r['selectedDate']} instead of today"
    assert r["selectedDate"] != "2026-05-05"
    # Past dates must be sorted newest-first for archive use
    assert r["pastDates"] == ["2026-05-06", "2026-05-05", "2026-05-04"]
    # Latest archived should be May 5 (the one with content)
    assert r["latestArchivedDate"] == "2026-05-05"
    # Upcoming tabs must NOT include past dates
    assert "2026-05-05" not in r["upcomingAndTodayDates"]
    assert "2026-05-04" not in r["upcomingAndTodayDates"]
    asserts += 7

    # ── Test 5: no today, future exists with leans → upcoming ────────────
    r = select_active_slate(
        ["2026-05-08", "2026-05-09"],
        "2026-05-07",
        {
            "2026-05-08": {"leans": []},
            "2026-05-09": {"leans": [{"id": 1}, {"id": 2}]},
        },
    )
    assert r["kind"] == "upcoming"
    # Should pick May 9 (has leans) over May 8 (empty)
    assert r["selectedDate"] == "2026-05-09"
    asserts += 2

    # ── Test 6: no today, future has no leans → upcoming (nearest) ───────
    r = select_active_slate(
        ["2026-05-08", "2026-05-09"],
        "2026-05-07",
        {"2026-05-08": {"leans": []}, "2026-05-09": {"leans": []}},
    )
    assert r["kind"] == "upcoming"
    assert r["selectedDate"] == "2026-05-08"  # nearest
    asserts += 2

    # ── Test 7: only past data → no_current with archive surfaced ────────
    r = select_active_slate(
        ["2026-05-04", "2026-05-05"],
        "2026-05-07",
        {
            "2026-05-04": {"leans": []},
            "2026-05-05": {"leans": [{"id": i} for i in range(10)]},
        },
    )
    assert r["kind"] == "no_current"
    assert r["selectedDate"] is None
    assert r["upcomingAndTodayDates"] == []
    assert r["pastDates"] == ["2026-05-05", "2026-05-04"]
    assert r["latestArchivedDate"] == "2026-05-05"
    asserts += 5

    # ── Test 8: only past data, no leans anywhere ────────────────────────
    r = select_active_slate(
        ["2026-05-04", "2026-05-05"],
        "2026-05-07",
        {"2026-05-04": {"leans": []}, "2026-05-05": {"leans": []}},
    )
    assert r["kind"] == "no_current"
    # Latest archived should still be the most recent past date even
    # without leans (the archive view will say "no leans on this date"
    # rather than skipping it).
    assert r["latestArchivedDate"] == "2026-05-05"
    asserts += 2

    # ── Test 9: only future, only one date with leans ────────────────────
    r = select_active_slate(
        ["2026-05-09"],
        "2026-05-07",
        {"2026-05-09": {"leans": [{"id": 1}]}},
    )
    assert r["kind"] == "upcoming"
    assert r["selectedDate"] == "2026-05-09"
    assert r["pastDates"] == []
    asserts += 3

    # ── Test 10: today + future, today has leans → today wins ────────────
    r = select_active_slate(
        ["2026-05-07", "2026-05-08", "2026-05-09"],
        "2026-05-07",
        {
            "2026-05-07": {"leans": [{"id": 1}]},
            "2026-05-08": {"leans": [{"id": 2}]},
            "2026-05-09": {"leans": [{"id": 3}]},
        },
    )
    assert r["kind"] == "today"
    assert r["selectedDate"] == "2026-05-07"
    assert r["upcomingAndTodayDates"] == ["2026-05-07", "2026-05-08", "2026-05-09"]
    asserts += 3

    # ── Test 11: real Phase 15 scenario from sandbox data ────────────────
    # Available: 05-04 through 05-09 (6 dates)
    # Today: 05-07
    # Only 05-05 has leans (24)
    # Today (05-07) has zero leans, mode=ScheduleUnavailable
    # Future (05-08, 05-09) all empty
    # Expected: kind=today, selectedDate=05-07, archive surfaces 05-05
    r = select_active_slate(
        ["2026-05-04", "2026-05-05", "2026-05-06", "2026-05-07",
         "2026-05-08", "2026-05-09"],
        "2026-05-07",
        {
            "2026-05-04": {"leans": []},
            "2026-05-05": {"leans": [{} for _ in range(24)]},
            "2026-05-06": {"leans": []},
            "2026-05-07": {"leans": []},
            "2026-05-08": {"leans": []},
            "2026-05-09": {"leans": []},
        },
    )
    assert r["kind"] == "today"
    assert r["selectedDate"] == "2026-05-07"
    # Tabs include today + 2 future, NOT the 3 past
    assert r["upcomingAndTodayDates"] == ["2026-05-07", "2026-05-08", "2026-05-09"]
    # Archive surfaces the past with content
    assert r["latestArchivedDate"] == "2026-05-05"
    asserts += 4

    # ── Test 12: phase 15 second scenario (week with no data on 07) ─────
    # If today (05-07) wasn't on disk at all and only past + 05-05 with
    # leans exists, the result is no_current.
    r = select_active_slate(
        ["2026-05-04", "2026-05-05", "2026-05-06"],
        "2026-05-07",
        {
            "2026-05-05": {"leans": [{} for _ in range(24)]},
        },
    )
    assert r["kind"] == "no_current"
    assert r["selectedDate"] is None, \
        f"BUG: no_current must not have a selectedDate, got {r['selectedDate']}"
    assert r["latestArchivedDate"] == "2026-05-05"
    asserts += 3

    print(f"\n  ✓ all {asserts} activeSlate assertions passed\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
