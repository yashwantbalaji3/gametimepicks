"""Capture-provenance regression (Program 117-122).

THE DEFECT (found live 2026-08-03)
`fetch_event_odds` served cache hits with synthetic headers that discarded `cached_at`, so the
board generator could not tell a cache hit from a live read and stamped `capturedAt = now()` on
every row. Observed in production: the 12:03 ET regeneration spent **0 credits** (`"after":
"cache"`) yet moved `capturedAt` on all 211 rows from `04:34Z` to `16:03Z` — identical rows,
identical model values, a brand-new capture timestamp.

That is the restamped-cache condition the append-only patch validator explicitly refuses. The
canonical generator must not do it either: `capturedAt` is the one provenance field that cannot
be reconstructed afterwards, and the research corpus treats it as a fact about when prices were
actually observed.

Run: PYTHONPATH=. python3 -m pipeline.mlb.capture_provenance_test
"""
from __future__ import annotations

import datetime as _dt
import json
import sys

from . import mlb_odds


def _now_iso() -> str:
    return _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def test_cache_hit_reports_the_true_observation_instant() -> None:
    key = "event_PROVENANCE_TEST_h2h_us"
    path = mlb_odds._cache_path(key)
    path.parent.mkdir(parents=True, exist_ok=True)
    observed = _dt.datetime.now(_dt.timezone.utc) - _dt.timedelta(minutes=90)
    path.write_text(json.dumps({"cached_at": observed.isoformat(), "data": {"ok": True}}))
    try:
        hit = mlb_odds._cache_get_stamped(key, 1440)
        assert hit is not None, "a fresh cache entry must be a hit"
        data, observed_at = hit
        assert data == {"ok": True}
        # The whole point: the stamp is the OBSERVATION time, not the read time.
        assert observed_at == observed.strftime("%Y-%m-%dT%H:%M:%SZ"), observed_at
        assert observed_at < _now_iso(), "a 90-minute-old capture must not claim to be now"
        # The plain accessor keeps its original contract for existing callers.
        assert mlb_odds._cache_get(key, 1440) == {"ok": True}
    finally:
        path.unlink(missing_ok=True)
    print("  \033[0;32m✓\033[0m cache hits carry the true observation instant")


def test_expired_cache_is_not_a_hit() -> None:
    key = "event_PROVENANCE_TEST_EXPIRED_h2h_us"
    path = mlb_odds._cache_path(key)
    path.parent.mkdir(parents=True, exist_ok=True)
    stale = _dt.datetime.now(_dt.timezone.utc) - _dt.timedelta(minutes=600)
    path.write_text(json.dumps({"cached_at": stale.isoformat(), "data": {"ok": True}}))
    try:
        assert mlb_odds._cache_get_stamped(key, 120) is None, "a stale entry must miss, not restamp"
    finally:
        path.unlink(missing_ok=True)
    print("  \033[0;32m✓\033[0m an expired cache entry is a miss, never a restamp")


def test_generator_prefers_the_observed_header_over_now() -> None:
    """The generator must stamp from `x-gtp-observed-at` when present."""
    src = (mlb_odds.__file__.replace("mlb_odds.py", "generate_mlb_board.py"))
    text = open(src).read()
    assert 'hdrs.get("x-gtp-observed-at")' in text, (
        "the generator must take capturedAt from the observed-at header on a cache hit"
    )
    # MUTATION: the unconditional form must not come back.
    assert 'captured_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")\n' not in text, (
        "an unconditional now() stamp re-introduces the restamped-cache defect"
    )
    print("  \033[0;32m✓\033[0m the generator stamps from real provenance, not the clock")


def main() -> int:
    print("\n=== pipeline.mlb capture-provenance tests ===")
    test_cache_hit_reports_the_true_observation_instant()
    test_expired_cache_is_not_a_hit()
    test_generator_prefers_the_observed_header_over_now()
    print("\n\033[0;32m✓ capture provenance is honest: cached data can never claim a fresh capture\033[0m")
    return 0


if __name__ == "__main__":
    sys.exit(main())
