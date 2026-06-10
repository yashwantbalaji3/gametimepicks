"""
feature_quality — shared, leakage-safe feature-quality helpers used across sports.

Pure functions (no I/O, no network) so they are trivially testable and safe to adopt
incrementally. They encode the upgrade plan's cross-sport rules:
  - sample-size bucketing + small-sample downweighting,
  - freshness / staleness of time-sensitive inputs (odds, lineups, injuries, weather),
  - explicit missing/unknown flags instead of silent neutral filling,
  - a rolling-window "excludes the current game" guard.

Nothing here fabricates data: missing inputs produce explicit flags, never guesses.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Iterable

# ---------------------------------------------------------------------------
# Sample size
# ---------------------------------------------------------------------------
def sample_size_bucket(n: int | None) -> str:
    """Coarse bucket for any historical/H2H/matchup sample. Drives downweighting +
    a sample-size flag in the UI/manifests."""
    if not n or n <= 0:
        return "none"
    if n < 5:
        return "tiny"
    if n < 15:
        return "small"
    if n < 30:
        return "moderate"
    return "ample"


def small_sample_weight(n: int | None, full_weight_at: int = 30) -> float:
    """Linear shrink in [0,1]: 0 with no data, 1.0 once n >= full_weight_at. Use to
    downweight small-sample features (batter-vs-pitcher, venue, H2H, country history)."""
    if not n or n <= 0:
        return 0.0
    if full_weight_at <= 0:
        return 1.0
    return max(0.0, min(1.0, n / float(full_weight_at)))


# ---------------------------------------------------------------------------
# Freshness / staleness of time-sensitive inputs
# ---------------------------------------------------------------------------
def _parse_ts(ts: Any) -> datetime | None:
    if isinstance(ts, datetime):
        return ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)
    if isinstance(ts, str) and ts:
        try:
            d = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    return None


def is_stale(timestamp: Any, max_age_minutes: float, *, now: datetime | None = None) -> bool:
    """True if the input is missing/unparseable OR older than max_age_minutes
    (fail-closed: unknown freshness is treated as stale)."""
    ref = now or datetime.now(timezone.utc)
    d = _parse_ts(timestamp)
    if d is None:
        return True
    age_min = (ref - d).total_seconds() / 60.0
    return age_min > max_age_minutes


def freshness_status(timestamp: Any, max_age_minutes: float, *, now: datetime | None = None) -> str:
    """'fresh' | 'stale' | 'unknown' — explicit, never silently 'fresh'."""
    if _parse_ts(timestamp) is None:
        return "unknown"
    return "stale" if is_stale(timestamp, max_age_minutes, now=now) else "fresh"


# ---------------------------------------------------------------------------
# Missing / unknown flags (no silent neutral fill)
# ---------------------------------------------------------------------------
def missing_flag(value: Any) -> bool:
    """True when an important input is absent (None / "" / NaN). Callers must surface
    this rather than substituting a neutral default."""
    if value is None:
        return True
    if isinstance(value, str) and not value.strip():
        return True
    if isinstance(value, float) and value != value:  # NaN
        return True
    return False


def required_source_status(value: Any, source: Any, timestamp: Any,
                           max_age_minutes: float, *, now: datetime | None = None) -> dict:
    """Bundle availability + provenance + freshness for a required, time-sensitive input."""
    present = not missing_flag(value)
    return {
        "present": present,
        "source": source or None,
        "freshness": freshness_status(timestamp, max_age_minutes, now=now) if present else "unknown",
        "usable": present and freshness_status(timestamp, max_age_minutes, now=now) == "fresh",
    }


def unknown_reason(present: bool, source: Any, fresh: str) -> str | None:
    """Human-readable reason a feature is unusable, or None when usable."""
    if not present:
        return "missing: input not available before prediction time"
    if not source:
        return "unsourced: no provenance for this input"
    if fresh != "fresh":
        return f"{fresh}: input is not fresh enough to trust"
    return None


# ---------------------------------------------------------------------------
# Leakage guard — every rolling window must EXCLUDE the target game/match
# ---------------------------------------------------------------------------
def rolling_excludes_current(rows: Iterable[dict], target_date: str,
                             date_key: str = "date") -> bool:
    """True iff NO row in the rolling window is dated on/after the target game date.
    A rolling feature that includes the target game leaks the outcome."""
    if not target_date:
        return False
    for r in rows or []:
        d = (r or {}).get(date_key) or ""
        if isinstance(d, str) and d[:10] >= target_date[:10]:
            return False
    return True


def filter_pregame_rows(rows: Iterable[dict], target_date: str,
                        date_key: str = "date") -> list[dict]:
    """Return only rows strictly BEFORE the target date — the safe rolling window."""
    out = []
    for r in rows or []:
        d = (r or {}).get(date_key) or ""
        if isinstance(d, str) and d[:10] < (target_date or "")[:10]:
            out.append(r)
    return out
