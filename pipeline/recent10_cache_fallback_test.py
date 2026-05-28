"""Tests for the stale-cache fallback path used by attach_recent10.

These exercise the only two public functions on the module:

  * ``load_stale_recent10_cache`` — accepts cache up to N days old,
    filters out games on/after the target slate date, returns the raw
    cached_at ISO so the caller can stamp provenance.
  * ``cache_age_label`` — compact human-readable age string.

Pure I/O — no network. Each test points the module at a temp directory
by monkey-patching the provider's ``CACHE_DIR`` constant.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from pipeline import config as provider_config
from pipeline import recent10_cache_fallback as fallback


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _write_cache(
    tmp_path: Path,
    player_id: int,
    last_n: int,
    cached_at: datetime,
    rows: list[dict],
) -> Path:
    path = tmp_path / f"nba_api_gamelogs_{player_id}_{last_n}.json"
    path.write_text(
        json.dumps(
            {
                "cached_at": cached_at.isoformat(),
                "data": rows,
            }
        )
    )
    return path


def _row(
    *,
    pid: int = 1,
    game_date: str = "2026-05-20",
    pts: int = 22,
    reb: int = 8,
    ast: int = 4,
) -> dict:
    return {
        "player_id": pid,
        "game_date": game_date,
        "opponent_abbr": "BOS",
        "home_away": "Home",
        "minutes": 30.0,
        "pts": pts,
        "reb": reb,
        "ast": ast,
    }


@pytest.fixture(autouse=True)
def patch_cache_dir(tmp_path, monkeypatch):
    """Re-point the provider's CACHE_DIR at a temp directory for each test."""
    monkeypatch.setattr(provider_config, "CACHE_DIR", tmp_path)
    yield tmp_path


# ---------------------------------------------------------------------------
# load_stale_recent10_cache
# ---------------------------------------------------------------------------


def test_missing_cache_returns_none(patch_cache_dir):
    logs, ts = fallback.load_stale_recent10_cache(player_id=99999)
    assert logs is None
    assert ts is None


def test_malformed_cache_returns_none(patch_cache_dir):
    path = patch_cache_dir / "nba_api_gamelogs_1_10.json"
    path.write_text("not-json")
    logs, ts = fallback.load_stale_recent10_cache(player_id=1)
    assert logs is None
    assert ts is None


def test_fresh_cache_returns_rows_and_cached_at(patch_cache_dir):
    cached_at = datetime.now(timezone.utc) - timedelta(hours=2)
    _write_cache(
        patch_cache_dir,
        player_id=1,
        last_n=10,
        cached_at=cached_at,
        rows=[_row(pid=1, game_date="2026-05-20"), _row(pid=1, game_date="2026-05-18")],
    )
    logs, ts = fallback.load_stale_recent10_cache(player_id=1, target_date="2026-05-28")
    assert logs is not None
    assert len(logs) == 2
    assert ts is not None
    # Round-trip: the returned ISO timestamp parses back to the original.
    assert datetime.fromisoformat(ts) == cached_at


def test_stale_cache_within_ttl_accepted(patch_cache_dir):
    # 5 days old — within the 14-day default TTL.
    cached_at = datetime.now(timezone.utc) - timedelta(days=5)
    _write_cache(
        patch_cache_dir,
        player_id=2,
        last_n=10,
        cached_at=cached_at,
        rows=[_row(pid=2, game_date="2026-05-15")],
    )
    logs, ts = fallback.load_stale_recent10_cache(player_id=2, target_date="2026-05-28")
    assert logs is not None
    assert len(logs) == 1
    assert ts is not None


def test_ancient_cache_rejected(patch_cache_dir):
    # 30 days old — outside the default 14-day TTL.
    cached_at = datetime.now(timezone.utc) - timedelta(days=30)
    _write_cache(
        patch_cache_dir,
        player_id=3,
        last_n=10,
        cached_at=cached_at,
        rows=[_row(pid=3, game_date="2026-04-20")],
    )
    logs, ts = fallback.load_stale_recent10_cache(player_id=3, target_date="2026-05-28")
    assert logs is None
    assert ts is None


def test_target_date_filter_drops_same_day_and_future(patch_cache_dir):
    cached_at = datetime.now(timezone.utc) - timedelta(hours=2)
    _write_cache(
        patch_cache_dir,
        player_id=4,
        last_n=10,
        cached_at=cached_at,
        rows=[
            _row(pid=4, game_date="2026-05-25"),  # ok (before target)
            _row(pid=4, game_date="2026-05-28"),  # SAME-DAY — must drop
            _row(pid=4, game_date="2026-05-30"),  # FUTURE — must drop
            _row(pid=4, game_date="2026-05-20"),  # ok
        ],
    )
    logs, _ = fallback.load_stale_recent10_cache(player_id=4, target_date="2026-05-28")
    assert logs is not None
    assert {g.game_date for g in logs} == {"2026-05-25", "2026-05-20"}


def test_no_target_date_keeps_everything(patch_cache_dir):
    # When the caller doesn't pass a target_date, we trust the data
    # verbatim — this matters for ad-hoc local tooling.
    cached_at = datetime.now(timezone.utc) - timedelta(hours=2)
    _write_cache(
        patch_cache_dir,
        player_id=5,
        last_n=10,
        cached_at=cached_at,
        rows=[_row(pid=5, game_date="2026-05-30")],
    )
    logs, _ = fallback.load_stale_recent10_cache(player_id=5)
    assert logs is not None
    assert len(logs) == 1


def test_empty_after_filter_returns_none(patch_cache_dir):
    # Every cached game is on/after target_date → no usable rows.
    cached_at = datetime.now(timezone.utc) - timedelta(hours=2)
    _write_cache(
        patch_cache_dir,
        player_id=6,
        last_n=10,
        cached_at=cached_at,
        rows=[
            _row(pid=6, game_date="2026-05-28"),
            _row(pid=6, game_date="2026-05-29"),
        ],
    )
    logs, ts = fallback.load_stale_recent10_cache(player_id=6, target_date="2026-05-28")
    assert logs is None
    assert ts is None


def test_zero_player_id_returns_none(patch_cache_dir):
    # zero / negative pids never index a real cache file.
    assert fallback.load_stale_recent10_cache(player_id=0) == (None, None)
    assert fallback.load_stale_recent10_cache(player_id=-1) == (None, None)


def test_custom_max_age_days(patch_cache_dir):
    # Cache is 20 days old — outside 14d default but within a 30d arg.
    cached_at = datetime.now(timezone.utc) - timedelta(days=20)
    _write_cache(
        patch_cache_dir,
        player_id=7,
        last_n=10,
        cached_at=cached_at,
        rows=[_row(pid=7, game_date="2026-05-01")],
    )
    logs_default, _ = fallback.load_stale_recent10_cache(
        player_id=7,
        target_date="2026-05-28",
    )
    assert logs_default is None
    logs_wide, _ = fallback.load_stale_recent10_cache(
        player_id=7,
        target_date="2026-05-28",
        max_age_days=30,
    )
    assert logs_wide is not None


def test_schema_drift_row_skipped_not_crash(patch_cache_dir):
    # Cached row missing required fields → silently skipped.
    cached_at = datetime.now(timezone.utc) - timedelta(hours=2)
    _write_cache(
        patch_cache_dir,
        player_id=8,
        last_n=10,
        cached_at=cached_at,
        rows=[
            {"game_date": "2026-05-20"},  # missing pts/reb/ast/player_id
            _row(pid=8, game_date="2026-05-19"),
        ],
    )
    logs, _ = fallback.load_stale_recent10_cache(player_id=8, target_date="2026-05-28")
    assert logs is not None
    assert len(logs) == 1
    assert logs[0].game_date == "2026-05-19"


# ---------------------------------------------------------------------------
# cache_age_label
# ---------------------------------------------------------------------------


def test_cache_age_label_hours_only():
    cached_at = (datetime.now(timezone.utc) - timedelta(hours=3, minutes=30)).isoformat()
    assert fallback.cache_age_label(cached_at).endswith("h")


def test_cache_age_label_days_and_hours():
    cached_at = (datetime.now(timezone.utc) - timedelta(days=2, hours=5)).isoformat()
    label = fallback.cache_age_label(cached_at)
    assert label.startswith("2d")
    assert label.endswith("h")


def test_cache_age_label_unknown_for_garbage():
    assert fallback.cache_age_label(None) == "unknown"
    assert fallback.cache_age_label("") == "unknown"
    assert fallback.cache_age_label("not-a-date") == "unknown"
