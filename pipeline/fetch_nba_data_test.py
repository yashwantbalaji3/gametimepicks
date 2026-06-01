"""
Tests for the NBA provider-chain circuit breaker (2026-05-31 resilience fix).

Covers:
  * ProviderCircuitBreaker — trips on consecutive slow failures and on the
    cumulative-failure-seconds budget; success resets the streak; fast
    failures never trip; a trip is sticky; reset() clears.
  * fetch_player_game_logs / fetch_team_roster — the breaker skips a hung
    provider after repeated slow failures, so the chain stops wasting
    ~25 s/player; the success path is unchanged; an "unsupported" provider
    fast-fails without tripping; when everything fails the result is empty
    (no fabrication, no cache fallback in the model path); total wall-clock
    is bounded regardless of player count; the breaker is shared across
    operations.
  * load_stale_recent10_cache — drops any cached game on/after the slate
    date (no future / same-day leakage), and the model fetch path does NOT
    consult that cache.

Pure: no network, no real clock. A fake clock + fake providers make timing
deterministic. Runnable standalone:

    pipeline/.venv/bin/python -m pipeline.fetch_nba_data_test
"""
from __future__ import annotations

import json
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

from . import config as C
from . import fetch_nba_data as F
from . import recent10_cache_fallback as cache_fallback
from .provider_circuit_breaker import ProviderCircuitBreaker
from .providers import GameLog, ProviderError, ProviderNotImplemented


# ---------------------------------------------------------------------------
# Tiny assertion harness (so this runs without pytest installed)
# ---------------------------------------------------------------------------
class _Suite:
    def __init__(self) -> None:
        self.passed = 0
        self.failed = 0
        self.failures: list[str] = []

    def check(self, cond: bool, msg: str) -> None:
        if cond:
            self.passed += 1
            print(f"  ✓ {msg}")
        else:
            self.failed += 1
            self.failures.append(msg)
            print(f"  ✗ {msg}")

    def eq(self, got, want, msg: str) -> None:
        self.check(got == want, f"{msg} (got {got!r}, want {want!r})")


# ---------------------------------------------------------------------------
# Fakes
# ---------------------------------------------------------------------------
class FakeClock:
    """Deterministic monotonic clock; providers advance it to simulate time."""

    def __init__(self) -> None:
        self.t = 0.0

    def __call__(self) -> float:
        return self.t

    def advance(self, dt: float) -> None:
        self.t += dt


_SAMPLE_LOG = GameLog(
    player_id=1,
    game_date="2026-05-20",
    opponent_abbr="LAL",
    home_away="Home",
    minutes=30.0,
    pts=20,
    reb=5,
    ast=4,
)


class FakeProvider:
    """Provider whose every call advances the shared clock by ``delay`` then
    succeeds or raises. ``calls`` records how many times it was invoked."""

    def __init__(self, name, *, clock, delay=0.0, outcome="success",
                 logs=None, error=None):
        self.name = name
        self._clock = clock
        self._delay = delay
        self._outcome = outcome
        self._logs = logs if logs is not None else [_SAMPLE_LOG]
        self._error = error
        self.calls = 0

    def _do(self):
        self.calls += 1
        if self._delay:
            self._clock.advance(self._delay)
        if self._outcome == "success":
            return self._logs
        raise self._error or ProviderError(f"{self.name} failed")

    def fetch_player_game_logs(self, player_id, last_n=10):
        return self._do()

    def fetch_team_roster(self, team_abbr):
        return self._do()

    def fetch_box_score(self, game_id):
        return self._do()


def _mk_breaker():
    return ProviderCircuitBreaker(
        slow_seconds=10.0, max_consecutive_slow=4, max_total_failure_seconds=120.0
    )


# ---------------------------------------------------------------------------
# Breaker unit tests
# ---------------------------------------------------------------------------
def test_breaker_trips_on_consecutive_slow(s):
    print("\n  --- breaker trips after consecutive slow failures ---")
    b = _mk_breaker()
    for i in range(3):
        b.record_failure("nba_api", 25.0)
        s.check(not b.is_tripped("nba_api"), f"not tripped after {i + 1} slow fails")
    b.record_failure("nba_api", 25.0)
    s.check(b.is_tripped("nba_api"), "tripped on the 4th consecutive slow fail")


def test_breaker_trips_on_total_seconds_budget(s):
    print("\n  --- breaker trips on cumulative failure-seconds budget ---")
    # High consecutive ceiling so only the seconds budget can trip it.
    b = ProviderCircuitBreaker(
        slow_seconds=10.0, max_consecutive_slow=999, max_total_failure_seconds=120.0
    )
    for _ in range(4):
        b.record_failure("nba_api", 25.0)  # 100s total
    s.check(not b.is_tripped("nba_api"), "100s < 120s budget — not tripped")
    b.record_failure("nba_api", 25.0)  # 125s total
    s.check(b.is_tripped("nba_api"), "125s >= 120s budget — tripped")


def test_breaker_success_resets_streak(s):
    print("\n  --- a success resets the consecutive-slow streak ---")
    # Huge seconds budget so ONLY the consecutive rule can trip — isolates
    # the streak-reset behaviour from the cumulative-budget backstop.
    b = ProviderCircuitBreaker(
        slow_seconds=10.0, max_consecutive_slow=4, max_total_failure_seconds=1e9
    )
    b.record_failure("nba_api", 25.0)
    b.record_failure("nba_api", 25.0)
    b.record_failure("nba_api", 25.0)
    b.record_success("nba_api")  # reset streak before it reaches 4
    b.record_failure("nba_api", 25.0)
    b.record_failure("nba_api", 25.0)
    b.record_failure("nba_api", 25.0)
    s.check(not b.is_tripped("nba_api"),
            "3 slow fails after a success stay below the consecutive trip")
    b.record_failure("nba_api", 25.0)
    s.check(b.is_tripped("nba_api"), "the 4th consecutive (post-reset) trips it")


def test_breaker_fast_failures_never_trip(s):
    print("\n  --- fast failures never trip the breaker ---")
    b = _mk_breaker()
    for _ in range(50):
        b.record_failure("espn", 0.0)  # instant capability failures
    s.check(not b.is_tripped("espn"), "50 instant failures leave espn un-tripped")


def test_breaker_tripped_is_sticky(s):
    print("\n  --- a tripped provider stays tripped even after a success ---")
    b = _mk_breaker()
    for _ in range(4):
        b.record_failure("nba_api", 25.0)
    s.check(b.is_tripped("nba_api"), "tripped")
    b.record_success("nba_api")
    s.check(b.is_tripped("nba_api"), "still tripped after a late success (sticky)")
    b.reset()
    s.check(not b.is_tripped("nba_api"), "reset() clears the trip")


def test_breaker_invalid_args(s):
    print("\n  --- invalid breaker config is rejected ---")
    for kwargs in (
        {"slow_seconds": 0},
        {"max_consecutive_slow": 0},
        {"max_total_failure_seconds": 0},
    ):
        try:
            ProviderCircuitBreaker(**kwargs)
            s.check(False, f"expected ValueError for {kwargs}")
        except ValueError:
            s.check(True, f"ValueError raised for {kwargs}")


# ---------------------------------------------------------------------------
# Integration: fetch_player_game_logs / roster with the breaker
# ---------------------------------------------------------------------------
def test_success_path_unchanged(s):
    print("\n  --- healthy provider: first success returned, nothing tripped ---")
    clk = FakeClock()
    b = _mk_breaker()
    nba = FakeProvider("nba_api", clock=clk, delay=0.4, outcome="success")
    logs, src = F.fetch_player_game_logs(7, chain=[nba], breaker=b, clock=clk)
    s.eq(src, "nba_api", "returns the first provider that succeeds")
    s.eq(len(logs), 1, "returns its logs")
    s.check(not b.is_tripped("nba_api"), "healthy provider never tripped")


def test_timeout_trips_and_skips(s):
    print("\n  --- nba_api timeouts trip the breaker; later players skip it ---")
    clk = FakeClock()
    b = _mk_breaker()
    nba = FakeProvider("nba_api", clock=clk, delay=25.0, outcome="error",
                       error=ProviderError("Read timed out"))
    espn = FakeProvider("espn", clock=clk, delay=0.0, outcome="error",
                        error=ProviderNotImplemented("not supported by this provider"))
    for pid in range(1, 51):
        F.fetch_player_game_logs(pid, chain=[nba, espn], breaker=b, clock=clk)
    s.check(b.is_tripped("nba_api"), "nba_api tripped after repeated slow timeouts")
    s.check(nba.calls <= 4, f"nba_api called at most 4x, not per-player (was {nba.calls})")
    s.eq(espn.calls, 50, "espn (fast) still tried for every player")
    s.check(not b.is_tripped("espn"), "espn never tripped (its failures are fast)")


def test_all_providers_fail_returns_empty(s):
    print("\n  --- all providers fail: empty result, no fabrication ---")
    clk = FakeClock()
    b = _mk_breaker()
    nba = FakeProvider("nba_api", clock=clk, delay=25.0, outcome="error",
                       error=ProviderError("Read timed out"))
    espn = FakeProvider("espn", clock=clk, delay=0.0, outcome="error",
                        error=ProviderNotImplemented("not supported"))
    logs, src = F.fetch_player_game_logs(99, chain=[nba, espn], breaker=b, clock=clk)
    s.eq(logs, [], "empty game-log list when every provider fails")
    s.eq(src, "none", "source is 'none' (honest insufficient-data, not invented)")


def test_unexpected_exception_does_not_abort_walk(s):
    print("\n  --- an unexpected (non-ProviderError) exception is contained ---")
    clk = FakeClock()
    b = _mk_breaker()
    # A provider bug: raises a bare ValueError instead of a ProviderError.
    buggy = FakeProvider("buggy", clock=clk, delay=0.0, outcome="error",
                         error=ValueError("kaboom"))
    demo = FakeProvider("demo", clock=clk, delay=0.0, outcome="success",
                        logs=[_SAMPLE_LOG])
    logs, src = F.fetch_player_game_logs(7, chain=[buggy, demo], breaker=b, clock=clk)
    s.eq(src, "demo", "walk survives an unexpected error and reaches the fallback")
    s.eq(len(logs), 1, "the healthy fallback still serves the request")
    s.eq(buggy.calls, 1, "the buggy provider was attempted exactly once")
    s.check(not b.is_tripped("buggy"), "a single fast unexpected error does not trip")


def test_total_time_bounded_regardless_of_count(s):
    print("\n  --- total wasted time is bounded no matter how many players ---")
    clk = FakeClock()
    b = _mk_breaker()
    nba = FakeProvider("nba_api", clock=clk, delay=25.0, outcome="error",
                       error=ProviderError("Read timed out"))
    espn = FakeProvider("espn", clock=clk, delay=0.0, outcome="error",
                        error=ProviderNotImplemented("not supported"))
    for pid in range(1, 501):  # 500 players
        F.fetch_player_game_logs(pid, chain=[nba, espn], breaker=b, clock=clk)
    # Only nba_api advances the clock (25s each) and it is capped at the
    # consecutive trip (4 calls) → ~100s total for 500 players.
    s.check(clk.t <= 120.0,
            f"500 players cost <=120s of nba_api time (was {clk.t:.0f}s)")
    s.check(nba.calls <= 5, f"nba_api hit at most a handful of times (was {nba.calls})")


def test_breaker_shared_across_operations(s):
    print("\n  --- a trip during roster fetch also skips nba_api for game logs ---")
    clk = FakeClock()
    b = _mk_breaker()
    nba = FakeProvider("nba_api", clock=clk, delay=25.0, outcome="error",
                       error=ProviderError("Read timed out"))
    demo = FakeProvider("demo", clock=clk, delay=0.0, outcome="success", logs=[])
    # 4 roster calls slow-fail nba_api (demo serves them) → nba_api trips.
    for team in ("BOS", "LAL", "OKC", "MIA"):
        _, src = F.fetch_team_roster(team, chain=[nba, demo], breaker=b, clock=clk)
    s.check(b.is_tripped("nba_api"), "nba_api tripped during roster fetches")
    calls_before = nba.calls
    # Now a game-log fetch must skip nba_api entirely.
    _, src = F.fetch_player_game_logs(42, chain=[nba, demo], breaker=b, clock=clk)
    s.eq(src, "demo", "game-log fetch served by demo (nba_api skipped)")
    s.eq(nba.calls, calls_before, "nba_api not called again once tripped")


# ---------------------------------------------------------------------------
# Cache safety: no future/same-day leakage; model path ignores cache
# ---------------------------------------------------------------------------
def _write_cache(cache_dir: Path, player_id: int, rows: list[dict]) -> None:
    cache_dir.mkdir(parents=True, exist_ok=True)
    (cache_dir / f"nba_api_gamelogs_{player_id}_10.json").write_text(
        json.dumps({
            "cached_at": datetime.now(timezone.utc).isoformat(),
            "data": rows,
        })
    )


def _row(game_date: str) -> dict:
    return {
        "player_id": 555, "game_date": game_date, "opponent_abbr": "LAL",
        "home_away": "Home", "minutes": 30.0, "pts": 20, "reb": 5, "ast": 4,
    }


def test_stale_cache_drops_future_and_same_day(s):
    print("\n  --- stale-cache fallback drops same-day / future games ---")
    orig = C.CACHE_DIR
    with tempfile.TemporaryDirectory() as td:
        C.CACHE_DIR = Path(td)
        try:
            _write_cache(Path(td), 555, [
                _row("2026-05-28"),  # past — keep
                _row("2026-05-29"),  # past — keep
                _row("2026-05-30"),  # same day as slate — DROP
                _row("2026-06-01"),  # future — DROP
            ])
            logs, cached_at = cache_fallback.load_stale_recent10_cache(
                555, last_n=10, target_date="2026-05-30")
            dates = sorted(g.game_date for g in (logs or []))
            s.eq(dates, ["2026-05-28", "2026-05-29"],
                 "only games strictly before the slate date survive")
            s.check(cached_at is not None, "provenance (cached_at) returned for stamping")
        finally:
            C.CACHE_DIR = orig


def test_model_path_does_not_consult_cache(s):
    print("\n  --- model fetch path never silently uses the stale cache ---")
    orig = C.CACHE_DIR
    clk = FakeClock()
    b = _mk_breaker()
    with tempfile.TemporaryDirectory() as td:
        C.CACHE_DIR = Path(td)
        try:
            # A real cache exists for this player...
            _write_cache(Path(td), 1234, [_row("2026-05-20")])
            nba = FakeProvider("nba_api", clock=clk, delay=25.0, outcome="error",
                               error=ProviderError("Read timed out"))
            espn = FakeProvider("espn", clock=clk, delay=0.0, outcome="error",
                                error=ProviderNotImplemented("not supported"))
            logs, src = F.fetch_player_game_logs(1234, chain=[nba, espn],
                                                 breaker=b, clock=clk)
            # ...but the model path returns empty, NOT the cached row. Stale
            # cache is opt-in (display/enrichment only), never auto-used here.
            s.eq(logs, [], "model fetch returns empty despite a cache file existing")
            s.eq(src, "none", "no provider claimed it; cache was not consulted")
        finally:
            C.CACHE_DIR = orig


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------
def main() -> int:
    print("\n  NBA provider circuit-breaker tests")
    print("  (no network, deterministic clock)")
    s = _Suite()
    for fn in (
        test_breaker_trips_on_consecutive_slow,
        test_breaker_trips_on_total_seconds_budget,
        test_breaker_success_resets_streak,
        test_breaker_fast_failures_never_trip,
        test_breaker_tripped_is_sticky,
        test_breaker_invalid_args,
        test_success_path_unchanged,
        test_timeout_trips_and_skips,
        test_all_providers_fail_returns_empty,
        test_unexpected_exception_does_not_abort_walk,
        test_total_time_bounded_regardless_of_count,
        test_breaker_shared_across_operations,
        test_stale_cache_drops_future_and_same_day,
        test_model_path_does_not_consult_cache,
    ):
        fn(s)
    print()
    if s.failed == 0:
        print(f"  ✓ all {s.passed} assertions passed")
        return 0
    print(f"  ✗ {s.failed} of {s.passed + s.failed} assertions FAILED")
    for f in s.failures:
        print(f"      - {f}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
