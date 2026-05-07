"""
Phase 14 — pipeline.freshness_test

Python port of the freshness/date-label rules in
`app/src/lib/freshness.ts` plus regression assertions for the day-label
contract. The TS and Python implementations MUST stay in sync — tests
here lock the rule.

Zero network. Zero filesystem mutation.
"""
from __future__ import annotations

from datetime import datetime, timezone, timedelta


# ---------------------------------------------------------------------------
# Python ports (must mirror freshness.ts)
# ---------------------------------------------------------------------------

def offset_et_date(today: str, days: int) -> str:
    """Mirror of offsetEtDate()."""
    y, m, d = (int(p) for p in today.split("-"))
    base = datetime(y, m, d, tzinfo=timezone.utc)
    shifted = base + timedelta(days=days)
    return shifted.strftime("%Y-%m-%d")


def day_label_for(date: str, today: str) -> str:
    """Mirror of dayLabelFor()."""
    if date == today:
        return "Today"
    if date == offset_et_date(today, -1):
        return "Yesterday"
    if date == offset_et_date(today, 1):
        return "Tomorrow"
    # Long-form fallback. Locale formatting differs between Python and
    # JS Intl, so we don't strictly mirror that string here — we just
    # confirm the relative-keyword cases stay correct.
    y, m, d = (int(p) for p in date.split("-"))
    return datetime(y, m, d).strftime("%a %b %-d")


def classify_slate(primary_date: str | None, today: str) -> str:
    """Mirror of classifySlate()."""
    if not primary_date:
        return "no_data"
    if primary_date == today:
        return "current"
    if primary_date < today:
        return "previous"
    return "future"


def days_old_vs(primary_date: str, today: str) -> int:
    """Mirror of daysOldVs()."""
    py, pm, pd = (int(p) for p in primary_date.split("-"))
    ty, tm, td = (int(p) for p in today.split("-"))
    p = datetime(py, pm, pd, tzinfo=timezone.utc)
    t = datetime(ty, tm, td, tzinfo=timezone.utc)
    return round((t - p).total_seconds() / 86400)


def classify_run(last_iso: str | None, now: datetime | None = None) -> str:
    """Mirror of classifyRun()."""
    if not last_iso:
        return "unknown"
    try:
        last = datetime.fromisoformat(last_iso.replace("Z", "+00:00"))
    except ValueError:
        return "unknown"
    n = now or datetime.now(timezone.utc)
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    delta = n - last
    if delta.total_seconds() < 0:
        return "fresh"
    hours = delta.total_seconds() / 3600
    if hours < 3:
        return "fresh"
    if hours < 12:
        return "recent"
    if hours < 48:
        return "stale"
    return "very_stale"


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def main() -> int:
    asserts = 0

    # ── Test 1: offset_et_date basics ─────────────────────────────────────
    assert offset_et_date("2026-05-07", 0) == "2026-05-07"
    assert offset_et_date("2026-05-07", 1) == "2026-05-08"
    assert offset_et_date("2026-05-07", -1) == "2026-05-06"
    assert offset_et_date("2026-05-07", 7) == "2026-05-14"
    assert offset_et_date("2026-05-07", -7) == "2026-04-30"
    asserts += 5

    # ── Test 2: month/year boundary ───────────────────────────────────────
    assert offset_et_date("2026-04-30", 1) == "2026-05-01"
    assert offset_et_date("2026-05-01", -1) == "2026-04-30"
    assert offset_et_date("2026-12-31", 1) == "2027-01-01"
    assert offset_et_date("2027-01-01", -1) == "2026-12-31"
    asserts += 4

    # ── Test 3: leap year handling ────────────────────────────────────────
    assert offset_et_date("2024-02-28", 1) == "2024-02-29"  # leap year
    assert offset_et_date("2024-02-29", 1) == "2024-03-01"
    assert offset_et_date("2025-02-28", 1) == "2025-03-01"  # non-leap
    asserts += 3

    # ── Test 4: day_label_for — the relative cases ────────────────────────
    today = "2026-05-07"
    assert day_label_for("2026-05-07", today) == "Today"
    assert day_label_for("2026-05-06", today) == "Yesterday"
    assert day_label_for("2026-05-08", today) == "Tomorrow"
    asserts += 3

    # ── Test 5: day_label_for — non-relative cases produce date strings ──
    label = day_label_for("2026-05-12", today)
    assert label != "Today"
    assert label != "Yesterday"
    assert label != "Tomorrow"
    assert "May" in label or "5/" in label
    asserts += 4

    # ── Test 6: THE BUG — May 5 is NOT "Today" when today is May 7 ───────
    # This is the exact bug the user reported.
    real_today = "2026-05-07"
    assert day_label_for("2026-05-05", real_today) != "Today"
    assert day_label_for("2026-05-05", real_today) != "Yesterday"
    # 2 days ago should be a long-form date, not a relative keyword
    label = day_label_for("2026-05-05", real_today)
    assert "Today" not in label
    asserts += 3

    # ── Test 7: classify_slate ────────────────────────────────────────────
    assert classify_slate("2026-05-07", "2026-05-07") == "current"
    assert classify_slate("2026-05-05", "2026-05-07") == "previous"
    assert classify_slate("2026-05-09", "2026-05-07") == "future"
    assert classify_slate(None, "2026-05-07") == "no_data"
    assert classify_slate("", "2026-05-07") == "no_data"
    asserts += 5

    # ── Test 8: days_old_vs ───────────────────────────────────────────────
    assert days_old_vs("2026-05-07", "2026-05-07") == 0
    assert days_old_vs("2026-05-05", "2026-05-07") == 2
    assert days_old_vs("2026-05-09", "2026-05-07") == -2
    # Cross-month
    assert days_old_vs("2026-04-30", "2026-05-02") == 2
    asserts += 4

    # ── Test 9: classify_run ──────────────────────────────────────────────
    base = datetime(2026, 5, 7, 12, 0, 0, tzinfo=timezone.utc)
    # 1 hour ago → fresh
    assert classify_run((base - timedelta(hours=1)).isoformat(), base) == "fresh"
    # 6 hours ago → recent
    assert classify_run((base - timedelta(hours=6)).isoformat(), base) == "recent"
    # 24 hours ago → stale
    assert classify_run((base - timedelta(hours=24)).isoformat(), base) == "stale"
    # 60 hours ago → very_stale
    assert classify_run((base - timedelta(hours=60)).isoformat(), base) == "very_stale"
    # None → unknown
    assert classify_run(None, base) == "unknown"
    # Garbage string → unknown
    assert classify_run("not-a-timestamp", base) == "unknown"
    # Future timestamp (clock skew) → fresh (optimistic)
    assert classify_run((base + timedelta(hours=2)).isoformat(), base) == "fresh"
    asserts += 7

    # ── Test 10: Boundary cases for run classification ────────────────────
    # Exactly 3 hours → recent (not fresh)
    assert classify_run((base - timedelta(hours=3, seconds=1)).isoformat(), base) == "recent"
    # Exactly 12 hours → stale (not recent)
    assert classify_run((base - timedelta(hours=12, seconds=1)).isoformat(), base) == "stale"
    # Exactly 48 hours → very_stale
    assert classify_run((base - timedelta(hours=48, seconds=1)).isoformat(), base) == "very_stale"
    asserts += 3

    # ── Test 11: realistic Phase 14 scenario ──────────────────────────────
    # The exact data the sandbox has right now: meta.lastPipelineRun =
    # 2026-05-05T17:25:39+00:00, real today = 2026-05-07.
    last_run = "2026-05-05T17:25:39+00:00"
    real_now = datetime(2026, 5, 7, 18, 0, 0, tzinfo=timezone.utc)
    # ~48.5 hours since pipeline ran → very_stale
    assert classify_run(last_run, real_now) == "very_stale"
    # Slate primaryDate = 2026-05-05, today = 2026-05-07
    assert classify_slate("2026-05-05", "2026-05-07") == "previous"
    assert days_old_vs("2026-05-05", "2026-05-07") == 2
    # The day labels for the 6-day slate that frozen-pipeline shipped:
    today_real = "2026-05-07"
    assert day_label_for("2026-05-04", today_real) != "Yesterday"  # actually Yesterday is 5-06
    assert day_label_for("2026-05-05", today_real) != "Today"  # the bug fix
    assert day_label_for("2026-05-06", today_real) == "Yesterday"
    assert day_label_for("2026-05-07", today_real) == "Today"
    assert day_label_for("2026-05-08", today_real) == "Tomorrow"
    asserts += 8

    print(f"\n  ✓ all {asserts} freshness assertions passed\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
