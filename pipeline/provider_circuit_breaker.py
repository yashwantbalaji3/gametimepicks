"""
Provider circuit breaker — bounds the time wasted on a slow-failing data
provider so a single outage can't stall the projection pipeline.

Background
----------
NBA.com (``nba_api``) intermittently blocks GitHub Actions runner IPs. When
it does, every game-log fetch read-times-out at ~25 s. Across a full slate
that is tens of minutes — enough to blow the ``morning-projections`` job's
25-minute budget so it never commits (the 2026-05-31 incident: every NBA
player timed out, the run hit the limit and was cancelled, and the day got
no projections).

This breaker watches a provider chain. When a provider's **slow** failures
pile up — either ``max_consecutive_slow`` in a row, or
``max_total_failure_seconds`` cumulatively within one run — that provider is
"tripped" and skipped for the rest of the run. Two deliberate properties:

* **Fast failures never trip it.** A provider that raises immediately (e.g.
  ``ProviderNotImplemented`` returning in ~0 s) costs no wall-clock, so it is
  not counted as slow and keeps being tried. The breaker exists only to stop
  burning 25 s/call on a hung host.
* **Any success resets the consecutive counter.** A flaky-but-working
  provider is not tripped on an occasional timeout; the cumulative-seconds
  budget is the backstop that still bounds total waste.

State is per-process. A fresh CI run constructs a clean breaker, so a trip
never leaks across runs.

Honesty
-------
The breaker only ever *skips* a provider. It never invents data. When every
provider is skipped or fails, the caller returns an empty result and the
affected player's projection is honestly suppressed (insufficient data) —
never fabricated.
"""
from __future__ import annotations

import threading


class ProviderCircuitBreaker:
    """Per-process breaker keyed by provider name.

    Parameters
    ----------
    slow_seconds:
        A failed call taking at least this many seconds counts as a *slow*
        failure. Must be comfortably below the provider's own request
        timeout so genuine timeouts register as slow, and comfortably above
        a fast capability error (``ProviderNotImplemented``) so those do not.
    max_consecutive_slow:
        Trip after this many consecutive slow failures (no success in
        between). Detects a sustained outage quickly.
    max_total_failure_seconds:
        Trip once the cumulative wall-clock spent in *failed* calls to a
        provider reaches this budget within the run. Bounds total waste even
        when failures are interleaved with the odd success.
    """

    def __init__(
        self,
        *,
        slow_seconds: float = 10.0,
        max_consecutive_slow: int = 4,
        max_total_failure_seconds: float = 120.0,
    ) -> None:
        if slow_seconds <= 0:
            raise ValueError("slow_seconds must be > 0")
        if max_consecutive_slow < 1:
            raise ValueError("max_consecutive_slow must be >= 1")
        if max_total_failure_seconds <= 0:
            raise ValueError("max_total_failure_seconds must be > 0")
        self.slow_seconds = float(slow_seconds)
        self.max_consecutive_slow = int(max_consecutive_slow)
        self.max_total_failure_seconds = float(max_total_failure_seconds)
        self._lock = threading.Lock()
        self._consecutive_slow: dict[str, int] = {}
        self._total_failure_seconds: dict[str, float] = {}
        self._tripped: set[str] = set()

    def is_tripped(self, provider_name: str) -> bool:
        """True when this provider should be skipped for the rest of the run."""
        with self._lock:
            return provider_name in self._tripped

    def record_success(self, provider_name: str) -> None:
        """A successful call — reset the consecutive-slow streak.

        The cumulative-seconds budget is intentionally *not* reset: it is a
        per-run ceiling on total wasted time, not a streak.
        """
        with self._lock:
            self._consecutive_slow[provider_name] = 0

    def record_failure(self, provider_name: str, elapsed_seconds: float) -> None:
        """A failed call that took ``elapsed_seconds`` wall-clock.

        Updates the slow streak / cumulative budget and trips the provider
        if either threshold is reached.
        """
        elapsed = max(0.0, float(elapsed_seconds))
        with self._lock:
            self._total_failure_seconds[provider_name] = (
                self._total_failure_seconds.get(provider_name, 0.0) + elapsed
            )
            if elapsed >= self.slow_seconds:
                self._consecutive_slow[provider_name] = (
                    self._consecutive_slow.get(provider_name, 0) + 1
                )
            else:
                # A fast failure breaks the slow streak but is not itself
                # evidence of a hung host.
                self._consecutive_slow[provider_name] = 0
            if (
                self._consecutive_slow.get(provider_name, 0)
                >= self.max_consecutive_slow
                or self._total_failure_seconds.get(provider_name, 0.0)
                >= self.max_total_failure_seconds
            ):
                self._tripped.add(provider_name)

    def tripped_providers(self) -> set[str]:
        """Snapshot of provider names currently tripped (for logging)."""
        with self._lock:
            return set(self._tripped)

    def reset(self) -> None:
        """Clear all state. Mainly for tests; each CI run gets a fresh breaker."""
        with self._lock:
            self._consecutive_slow.clear()
            self._total_failure_seconds.clear()
            self._tripped.clear()
