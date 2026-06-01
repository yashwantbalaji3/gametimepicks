"""
Fetch NBA player data — game logs and rosters — using the provider chain.

This module sits above the providers and handles failover. Each function
walks the provider chain in priority order and returns the first success.

Resilience (2026-05-31 fix)
---------------------------
NBA.com (``nba_api``) periodically blocks GitHub Actions IPs. When it does,
every call read-times-out at ~25 s; across a full slate that stalled the
``morning-projections`` job past its 25-minute budget so it produced nothing.

A process-wide :class:`ProviderCircuitBreaker` now wraps the chain walk and
is **shared across all three fetch helpers**. Once a provider's slow failures
exceed the breaker's thresholds, it is skipped for the remainder of the run,
so a hung host can waste at most a bounded amount of time (roughly
``max_consecutive_slow × per-call-timeout``) instead of stalling the whole
job. The breaker only skips providers; it never invents data. When every
provider fails or is skipped, the helper returns an empty result and the
caller honestly suppresses that player's projection.
"""
from __future__ import annotations

import logging
import time
from typing import Callable, TypeVar

from .providers import (
    Player, GameLog,
    ProviderError, get_nba_provider_chain,
)
from .provider_circuit_breaker import ProviderCircuitBreaker


log = logging.getLogger(__name__)

T = TypeVar("T")

# One breaker per process, shared across game-log / roster / box-score walks
# so a provider that hangs on one operation is skipped for all of them for the
# rest of the run. A fresh process (each CI run) starts with a clean breaker.
_NBA_BREAKER = ProviderCircuitBreaker()

# Monotonic clock indirection so tests can inject a deterministic clock.
_clock: Callable[[], float] = time.monotonic


def _walk_nba_provider_chain(
    label: str,
    attempt: Callable[[object], T],
    empty_value: T,
    *,
    chain=None,
    breaker: ProviderCircuitBreaker | None = None,
    clock: Callable[[], float] | None = None,
) -> tuple[T, str]:
    """Walk the NBA provider chain, returning the first success.

    Providers the breaker has tripped are skipped. Each failed attempt is
    timed; slow failures feed the breaker so a hung provider is dropped for
    the rest of the run. Behaviour on the success path is identical to a
    plain chain walk — the breaker is pure overhead (a set lookup + a clock
    read) when providers are healthy.

    Both ``ProviderError`` and any *unexpected* exception are treated as a
    failure of that provider: timing is recorded and the walk continues to
    the next provider. An unexpected exception is logged at error level (it
    signals a provider bug worth fixing) but must never abort failover.

    ``chain`` / ``breaker`` / ``clock`` are injectable for tests; real callers
    use the module defaults.
    """
    chain = get_nba_provider_chain() if chain is None else chain
    breaker = _NBA_BREAKER if breaker is None else breaker
    clock = _clock if clock is None else clock

    last_error: Exception | None = None
    skipped: list[str] = []
    for provider in chain:
        if breaker.is_tripped(provider.name):
            skipped.append(provider.name)
            continue
        start = clock()
        try:
            result = attempt(provider)
            breaker.record_success(provider.name)
            return result, provider.name
        except ProviderError as e:
            elapsed = max(0.0, clock() - start)
            breaker.record_failure(provider.name, elapsed)
            last_error = e
            log.warning(
                f"[{label}] {provider.name} failed after {elapsed:.1f}s: {e}"
            )
            continue
        except Exception as e:  # noqa: BLE001 — defensive resilience boundary
            # A provider should only raise ProviderError, but an unwrapped
            # exception (e.g. a bare requests ConnectionError or a provider
            # bug) must never abort the whole chain walk — that would defeat
            # the point of the failover. Record the time so the breaker can
            # still bound a slow offender, log loudly at error level so the
            # bug stays visible, then fall through to the next provider.
            elapsed = max(0.0, clock() - start)
            breaker.record_failure(provider.name, elapsed)
            last_error = e
            log.error(
                f"[{label}] {provider.name} raised an UNEXPECTED "
                f"{type(e).__name__} after {elapsed:.1f}s "
                f"(treated as a provider failure): {e}"
            )
            continue

    if skipped:
        log.warning(
            f"[{label}] skipped breaker-tripped providers {skipped} "
            f"(open: {sorted(breaker.tripped_providers())})"
        )
    log.error(f"[{label}] all providers failed or were skipped: {last_error}")
    return empty_value, "none"


def fetch_player_game_logs(
    player_id: int,
    last_n: int = 10,
    *,
    chain=None,
    breaker: ProviderCircuitBreaker | None = None,
    clock: Callable[[], float] | None = None,
) -> tuple[list[GameLog], str]:
    return _walk_nba_provider_chain(
        f"game_logs player={player_id}",
        lambda p: p.fetch_player_game_logs(player_id, last_n=last_n),
        [],
        chain=chain,
        breaker=breaker,
        clock=clock,
    )


def fetch_team_roster(
    team_abbr: str,
    *,
    chain=None,
    breaker: ProviderCircuitBreaker | None = None,
    clock: Callable[[], float] | None = None,
) -> tuple[list[Player], str]:
    return _walk_nba_provider_chain(
        f"roster {team_abbr}",
        lambda p: p.fetch_team_roster(team_abbr),
        [],
        chain=chain,
        breaker=breaker,
        clock=clock,
    )


def fetch_box_score(
    game_id: str,
    *,
    chain=None,
    breaker: ProviderCircuitBreaker | None = None,
    clock: Callable[[], float] | None = None,
) -> tuple[list[GameLog], str]:
    return _walk_nba_provider_chain(
        f"box_score {game_id}",
        lambda p: p.fetch_box_score(game_id),
        [],
        chain=chain,
        breaker=breaker,
        clock=clock,
    )
