"""
Generate the multi-day model board.

Phase 7B-1.2 — schedule resolution with manual-override fallback and proper
distinction between "provider confirmed empty" and "provider failed".

Resolution priority for each date (in order, first match wins):
  1. NBA_DATA_MODE=demo or ODDS_DATA_MODE=demo
       → DemoForced (full demo schedule + props)
  2. nba_api.fetch_schedule_with_diagnostics(date) returns games
       → ScheduleLiveOddsUnavailable (source=nba_api)
  3. nba_api failed OR returned empty AND a manual schedule override exists
       → ScheduleLiveOddsUnavailable (source=manual)
  4. nba_api confirmed empty AND no manual override
       → NoGames
  5. nba_api failed AND no manual override
       → ScheduleUnavailable

This is intentionally narrower than Phase 7B-1.1's auto-fallback-to-demo
behavior: silently substituting demo data for a real-mode failure was the
root cause of the May 4 bug. Demo content now only renders when the
operator explicitly opts in via NBA_DATA_MODE=demo.

Every board.json gets diagnostic fields so this kind of failure is
inspectable instead of silent:

    requestedDate, timezone,
    scheduleSource, scheduleProviderStatus,
    scheduleFetchAttempted, scheduleFetchSucceeded, scheduleFailureReason,
    rawGameCountBeforeFiltering, parsedGameCountAfterFiltering,
    manualOverrideUsed, manualOverrideSource

The smoke test enforces a contract on these fields:
    if scheduleFetchSucceeded and rawGameCountBeforeFiltering > 0:
        assert parsedGameCountAfterFiltering > 0   # parser silently dropped all games
    NoGames mode requires scheduleProviderStatus == "ok" and rawCount == 0
    ScheduleUnavailable mode requires scheduleFetchSucceeded == False
"""
from __future__ import annotations

import argparse
import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from . import config as C
from .providers import (
    PropLine, ProviderError,
    diagnostic_summary, all_provider_statuses, now_iso,
)
from .fetch_nba_data import fetch_player_game_logs, fetch_team_roster
from .fetch_odds_data import fetch_props
from .build_features import build_player_features, build_trend_payload
from .score_model import score_prop
from .confidence_guardrails import apply_to_leans
from .player_resolver import resolve_player_id
from .manual_overrides import (
    NewsSignal, load_signals, signals_for_lean,
    aggregate_model_action, signals_to_json,
    load_schedule_override, has_schedule_overrides_file,
    SCHEDULE_OVERRIDES_PATH,
)
from .validation import LeanLogEntry, append_entries


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("gtp.board")


# ---------------------------------------------------------------------------
# Constants — DataMode values mirror app/src/lib/types.ts
# ---------------------------------------------------------------------------
DATA_MODE_LIVE = "Live"
DATA_MODE_SCHEDULE_ONLY = "ScheduleLiveOddsUnavailable"
DATA_MODE_NO_GAMES = "NoGames"
DATA_MODE_SCHEDULE_UNAVAIL = "ScheduleUnavailable"
DATA_MODE_DEMO_FORCED = "DemoForced"


# Phase 7B-2 — odds provider status sub-states
# These describe WHY props are/aren't available when schedule is real. They
# combine with dataMode (Live or ScheduleLiveOddsUnavailable) to drive the
# UI banner copy below the schedule strip.
ODDS_STATUS_NOT_CONFIGURED = "not_configured"   # ODDS_API_KEY missing
ODDS_STATUS_OK_WITH_PROPS = "ok_with_props"     # key + props returned
ODDS_STATUS_OK_NO_PROPS = "ok_no_props"         # key + zero props
ODDS_STATUS_FAILED = "failed"                   # key + API errored
ODDS_STATUS_DEMO = "demo"                       # DemoForced
# Phase 7B-3: dry-run mode — ODDS_DRY_RUN=true skips paid /odds calls.
# Pipeline still hits /events (free) so we can show what would be fetched.
ODDS_STATUS_DRY_RUN = "dry_run"


# ---------------------------------------------------------------------------
# Date helpers
# ---------------------------------------------------------------------------
def today_in_tz() -> str:
    return datetime.now(ZoneInfo(C.TIMEZONE)).strftime("%Y-%m-%d")


def slate_dates(start_date: str, n: int) -> list[str]:
    dt = datetime.strptime(start_date, "%Y-%m-%d").date()
    return [(dt + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(n)]


def day_label(target: str, today: str) -> str:
    t_today = datetime.strptime(today, "%Y-%m-%d").date()
    t_target = datetime.strptime(target, "%Y-%m-%d").date()
    delta = (t_target - t_today).days
    if delta == 0:
        return "Today"
    if delta == 1:
        return "Tomorrow"
    return t_target.strftime("%a %b ").lstrip() + str(t_target.day)


# ---------------------------------------------------------------------------
# Schedule resolution — Phase 7B-2.1
#
# Priority chain (first match wins):
#   1. Manual schedule override (operator-verified, highest trust)
#   2. nba_api (returns games)
#   3. ESPN public scoreboard (free, no key, no scraping)
#   4. NoGames — only if at least 2 providers independently confirm zero games
#   5. ScheduleUnavailable — single provider empty / all providers failed
#
# Phase 7B-1.2 had a bug where nba_api returning empty for a date with real
# playoff games (May 5 had CLE@DET + LAL@OKC; nba_api ScoreboardV2 returned 0)
# was classified as NoGames. That single-source confirmation isn't enough to
# claim "off-day". Now NoGames requires multi-source agreement.
# ---------------------------------------------------------------------------
def resolve_schedule_for_date(date: str) -> dict:
    """Returns a dict with games, dataMode, and full diagnostic metadata.

    Used by generate_for_date() — the orchestrator never calls nba_api or
    the override loader directly, so the resolution logic is in one place.
    """
    diag = {
        "requestedDate": date,
        "timezone": C.TIMEZONE,
        # "manual" | "nba_api" | "espn_scoreboard" | "multi_source" | "unavailable"
        "scheduleSource": None,
        "scheduleProviderStatus": None,   # "ok" | "failed" | "empty"
        "scheduleFetchAttempted": False,
        "scheduleFetchSucceeded": False,
        "scheduleFailureReason": None,
        "rawGameCountBeforeFiltering": 0,
        "parsedGameCountAfterFiltering": 0,
        "manualOverrideUsed": False,
        "manualOverrideSource": None,
        "endpointHistory": [],
        # Phase 7B-2.1: orchestrator-level provider attempts (one entry per
        # provider). Lets the smoke test verify NoGames isn't masking a
        # single-source failure.
        "scheduleProviderHistory": [],
    }

    # ------------------------------------------------------------------
    # Step 1 — Manual schedule override (highest priority)
    # ------------------------------------------------------------------
    override = load_schedule_override(date)
    if override and override.games:
        diag["scheduleSource"] = "manual"
        diag["scheduleProviderStatus"] = "ok"
        diag["scheduleFetchAttempted"] = True
        diag["scheduleFetchSucceeded"] = True
        diag["manualOverrideUsed"] = True
        diag["manualOverrideSource"] = override.sourceName
        diag["parsedGameCountAfterFiltering"] = len(override.games)
        diag["scheduleProviderHistory"].append({
            "provider": "manual",
            "status": "ok",
            "games": len(override.games),
            "error": None,
        })
        return {
            "games": override.games,
            "dataMode": DATA_MODE_SCHEDULE_ONLY,
            "diag": diag,
        }

    diag["scheduleProviderHistory"].append({
        "provider": "manual",
        "status": "no_match",
        "games": 0,
        "error": None,
    })

    # ------------------------------------------------------------------
    # Step 2 — nba_api (primary live source)
    # ------------------------------------------------------------------
    nba_diag = _try_nba_api_schedule(date)
    diag["scheduleFetchAttempted"] = True
    diag["endpointHistory"] = nba_diag["endpoint_history"]
    nba_games = nba_diag["games"]

    if nba_games:
        diag["scheduleSource"] = "nba_api"
        diag["scheduleProviderStatus"] = "ok"
        diag["scheduleFetchSucceeded"] = True
        diag["rawGameCountBeforeFiltering"] = nba_diag["raw_count_before"]
        diag["parsedGameCountAfterFiltering"] = nba_diag["parsed_count_after"]
        diag["scheduleProviderHistory"].append({
            "provider": "nba_api",
            "status": "ok",
            "games": len(nba_games),
            "error": None,
        })
        return {
            "games": nba_games,
            "dataMode": DATA_MODE_SCHEDULE_ONLY,
            "diag": diag,
        }

    # nba_api had no games — record outcome (success-empty vs error)
    if nba_diag["fetch_succeeded"]:
        diag["scheduleProviderHistory"].append({
            "provider": "nba_api",
            "status": "ok",      # request succeeded, just had 0 games
            "games": 0,
            "error": None,
        })
    else:
        diag["scheduleProviderHistory"].append({
            "provider": "nba_api",
            "status": "failed",
            "games": 0,
            "error": nba_diag["failure_reason"],
        })
        diag["scheduleFailureReason"] = nba_diag["failure_reason"]

    # ------------------------------------------------------------------
    # Step 3 — ESPN public scoreboard (compliance fallback)
    # ------------------------------------------------------------------
    espn_diag = _try_espn_schedule(date)
    espn_games = espn_diag["games"]

    if espn_games:
        diag["scheduleSource"] = "espn_scoreboard"
        diag["scheduleProviderStatus"] = "ok"
        diag["scheduleFetchSucceeded"] = True
        diag["rawGameCountBeforeFiltering"] = espn_diag["raw_count_before"]
        diag["parsedGameCountAfterFiltering"] = len(espn_games)
        # Clear nba_api failure reason — ESPN saved us
        diag["scheduleFailureReason"] = None
        diag["scheduleProviderHistory"].append({
            "provider": "espn_scoreboard",
            "status": "ok",
            "games": len(espn_games),
            "error": None,
        })
        return {
            "games": espn_games,
            "dataMode": DATA_MODE_SCHEDULE_ONLY,
            "diag": diag,
        }

    if espn_diag["fetch_succeeded"]:
        diag["scheduleProviderHistory"].append({
            "provider": "espn_scoreboard",
            "status": "ok",
            "games": 0,
            "error": None,
        })
    else:
        diag["scheduleProviderHistory"].append({
            "provider": "espn_scoreboard",
            "status": "failed",
            "games": 0,
            "error": espn_diag["failure_reason"],
        })
        # Don't overwrite nba_api's failure reason if it's set
        if not diag["scheduleFailureReason"]:
            diag["scheduleFailureReason"] = espn_diag["failure_reason"]

    # ------------------------------------------------------------------
    # Step 4 — NoGames vs ScheduleUnavailable
    #
    # NoGames requires AT LEAST TWO independent providers to successfully
    # return zero games. Single-source empty isn't enough — the May 5 bug
    # (nba_api ScoreboardV2 returning 0 for a real playoff date) is exactly
    # the failure mode this rule prevents.
    # ------------------------------------------------------------------
    confirmed_empty = sum(
        1
        for h in diag["scheduleProviderHistory"]
        if h["status"] == "ok" and h["games"] == 0
    )

    if confirmed_empty >= 2:
        # Multi-source agreement → it really is an off-day
        diag["scheduleSource"] = "multi_source"
        diag["scheduleProviderStatus"] = "ok"
        diag["scheduleFetchSucceeded"] = True
        diag["scheduleFailureReason"] = None
        return {
            "games": [],
            "dataMode": DATA_MODE_NO_GAMES,
            "diag": diag,
        }

    # Single-source empty OR all providers failed → uncertain
    diag["scheduleSource"] = "unavailable"
    diag["scheduleProviderStatus"] = "failed"
    if not diag["scheduleFailureReason"]:
        diag["scheduleFailureReason"] = (
            "Schedule providers were inconclusive — no provider returned games "
            "and fewer than 2 providers independently confirmed zero games."
        )
    return {
        "games": [],
        "dataMode": DATA_MODE_SCHEDULE_UNAVAIL,
        "diag": diag,
    }


def _try_nba_api_schedule(date: str) -> dict:
    """Wrapper around NbaApiProvider.fetch_schedule_with_diagnostics().

    Catches ImportError (package not installed) and any other exception so
    the orchestrator gets a uniform diag shape regardless of failure mode.
    """
    diag: dict = {
        "fetch_attempted": False,
        "fetch_succeeded": False,
        "failure_reason": None,
        "raw_count_before": 0,
        "parsed_count_after": 0,
        "games": [],
        "endpoint_history": [],
    }
    try:
        from .providers.nba_api_provider import NbaApiProvider
        provider = NbaApiProvider()
        d = provider.fetch_schedule_with_diagnostics(date)
        diag["fetch_attempted"] = d["fetch_attempted"]
        diag["fetch_succeeded"] = d["fetch_succeeded"]
        diag["failure_reason"] = d["failure_reason"]
        diag["raw_count_before"] = d["raw_count_before"]
        diag["parsed_count_after"] = d["parsed_count_after"]
        diag["games"] = _serialize_games(date, d["games"])
        diag["endpoint_history"] = d["endpoint_history"]
        return diag
    except ImportError as e:
        diag["fetch_attempted"] = True
        diag["failure_reason"] = f"nba_api not installed: {e}"
        return diag
    except Exception as e:
        diag["fetch_attempted"] = True
        diag["failure_reason"] = f"unexpected error: {e}"
        return diag


def _try_espn_schedule(date: str) -> dict:
    """Phase 7B-2.1 — wrapper around EspnProvider.fetch_schedule()."""
    diag: dict = {
        "fetch_attempted": False,
        "fetch_succeeded": False,
        "failure_reason": None,
        "raw_count_before": 0,
        "games": [],
    }
    if not C.ENABLE_ESPN_FALLBACK:
        diag["failure_reason"] = "ENABLE_ESPN_FALLBACK=false"
        return diag

    try:
        from .providers.espn_provider import EspnProvider
        provider = EspnProvider()
        diag["fetch_attempted"] = True
        games = provider.fetch_schedule(date)
        diag["fetch_succeeded"] = True
        diag["raw_count_before"] = len(games)
        diag["games"] = _serialize_games(date, games)
        return diag
    except ImportError as e:
        diag["fetch_attempted"] = True
        diag["failure_reason"] = f"requests not installed: {e}"
        return diag
    except Exception as e:
        diag["fetch_attempted"] = True
        diag["failure_reason"] = f"ESPN scoreboard error: {e}"
        return diag


def _serialize_games(date: str, games) -> list[dict]:
    """Convert Game dataclass instances to the JSON shape used in board.json."""
    out: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for g in games:
        pair = (g.home_team_abbr, g.away_team_abbr)
        if pair in seen:
            continue
        seen.add(pair)
        out.append({
            "gameId": g.game_id,
            "date": date,
            "tipoff": g.tipoff_et or "TBD",
            "homeTeamAbbr": g.home_team_abbr,
            "homeTeamFull": g.home_team_full,
            "awayTeamAbbr": g.away_team_abbr,
            "awayTeamFull": g.away_team_full,
            "status": g.status,
        })
    return out


# ---------------------------------------------------------------------------
# Per-date generation
# ---------------------------------------------------------------------------
def generate_for_date(
    target_date: str,
    *,
    today: str,
    signals: list[NewsSignal],
    is_primary: bool,
    nba_mode: str,
    odds_mode: str,
    has_odds_key: bool,
) -> dict:
    """Generate one date's payload."""
    log.info(f"--- {target_date} ---")

    # State 1 — explicit demo forced
    if nba_mode == "demo" or odds_mode == "demo":
        log.info(f"  mode: DemoForced")
        return _build_demo_payload(
            target_date,
            today=today,
            signals=signals,
            is_primary=is_primary,
        )

    # State 2-5 — resolve schedule via nba_api → manual → status
    resolution = resolve_schedule_for_date(target_date)
    games = resolution["games"]
    data_mode = resolution["dataMode"]
    diag = resolution["diag"]

    log.info(
        f"  schedule: {len(games)} games, "
        f"source={diag['scheduleSource']}, "
        f"status={diag['scheduleProviderStatus']}, "
        f"raw={diag['rawGameCountBeforeFiltering']}, "
        f"manual={diag['manualOverrideUsed']}"
    )
    log.info(f"  mode: {data_mode}")

    return _build_real_payload(
        target_date,
        today=today,
        signals=signals,
        is_primary=is_primary,
        games=games,
        data_mode=data_mode,
        diag=diag,
        nba_mode=nba_mode,
        odds_mode=odds_mode,
        has_odds_key=has_odds_key,
    )


# ---------------------------------------------------------------------------
# Real-schedule payload (all non-demo states)
# Phase 7B-2: this is also where odds resolution happens. If schedule is
# real and ODDS_API_KEY is set, we attempt to fetch real player props. If
# props come back, dataMode is upgraded from ScheduleLiveOddsUnavailable
# to Live; otherwise we stay in ScheduleLiveOddsUnavailable but record a
# sub-status (oddsProviderStatus) on the board so the UI can pick the
# right banner copy.
# ---------------------------------------------------------------------------
def _build_real_payload(
    target_date: str,
    *,
    today: str,
    signals: list[NewsSignal],
    is_primary: bool,
    games: list[dict],
    data_mode: str,
    diag: dict,
    nba_mode: str,
    odds_mode: str,
    has_odds_key: bool,
) -> dict:
    """Real schedule (or empty/unavailable). NEVER produces demo prop cards.

    Phase 7B-2 odds resolution:
      - schedule unavailable / no games   → odds skipped, status="not_configured"-ish
      - schedule has games + no odds key  → status="not_configured"
      - schedule + key + props returned   → dataMode upgrades to Live
      - schedule + key + zero props       → status="ok_no_props"
      - schedule + key + API failed       → status="failed"
    """
    schedule_source = diag["scheduleSource"] or "unavailable"

    # ------------------------------------------------------------------
    # Phase 7B-2 — resolve odds for this date
    # ------------------------------------------------------------------
    odds_diag = _resolve_odds_for_date(
        target_date,
        games=games,
        odds_mode=odds_mode,
        has_odds_key=has_odds_key,
        # Only attempt odds fetching if we have a real schedule with games
        skip=(data_mode in (DATA_MODE_NO_GAMES, DATA_MODE_SCHEDULE_UNAVAIL)
              or len(games) == 0),
    )

    # Score props (only if we actually got some)
    leans_payload, log_entries, trends_for_player, player_meta = (
        _score_real_props(
            target_date=target_date,
            games=games,
            props=odds_diag["props"],
            signals=signals,
            schedule_source=schedule_source,
            odds_source=odds_diag["odds_source"],
        )
        if odds_diag["props"]
        else ([], [], {}, {})
    )

    # PR 19: apply conservative confidence guardrails (R1-R5) before any
    # consumer (slate metadata, board JSON) sees the leans. Pure post-
    # processing — only-downgrades, audit-stamped via _guardrail/_originalConfidence.
    leans_payload, _guardrail_summary = apply_to_leans(leans_payload)

    # If real props ARE present, upgrade to Live
    final_data_mode = data_mode
    if data_mode == DATA_MODE_SCHEDULE_ONLY and leans_payload:
        final_data_mode = DATA_MODE_LIVE

    high_conf = sum(1 for l in leans_payload if l.get("confidence") == "High")

    slate_day = {
        "date": target_date,
        "dayLabel": day_label(target_date, today),
        # isAvailable means "we have something to show" — true for games OR for NoGames
        # but false for ScheduleUnavailable
        "isAvailable": data_mode != DATA_MODE_SCHEDULE_UNAVAIL,
        "gameCount": len(games),
        "leanCount": len(leans_payload),
        "highConfidenceCount": high_conf,
        "propsAvailable": bool(leans_payload),
        "isPrimary": is_primary,
        "scheduleSource": schedule_source,
        "oddsSource": odds_diag["odds_source"],
        "isDemo": False,
        "dataMode": final_data_mode,
        "failureReason": diag["scheduleFailureReason"],
        "oddsProviderStatus": odds_diag["odds_provider_status"],
    }

    board = {
        "generatedFor": target_date,
        "generatedAt": now_iso(),
        "dataSources": _build_data_sources_list(
            schedule_source, odds_diag["odds_source"]
        ),
        "isDemo": False,
        "leans": leans_payload,
        "scheduleAvailable": data_mode != DATA_MODE_SCHEDULE_UNAVAIL,
        "propsAvailable": bool(leans_payload),
        "scheduleSource": schedule_source,
        "oddsSource": odds_diag["odds_source"],
        "games": games,
        "dataMode": final_data_mode,
        "failureReason": diag["scheduleFailureReason"],
        # Phase 7B-1.2 schedule diagnostic fields
        "requestedDate": diag["requestedDate"],
        "timezone": diag["timezone"],
        "scheduleProviderStatus": diag["scheduleProviderStatus"],
        "scheduleFetchAttempted": diag["scheduleFetchAttempted"],
        "scheduleFetchSucceeded": diag["scheduleFetchSucceeded"],
        "scheduleFailureReason": diag["scheduleFailureReason"],
        "rawGameCountBeforeFiltering": diag["rawGameCountBeforeFiltering"],
        "parsedGameCountAfterFiltering": diag["parsedGameCountAfterFiltering"],
        "manualOverrideUsed": diag["manualOverrideUsed"],
        "manualOverrideSource": diag["manualOverrideSource"],
        "endpointHistory": diag["endpointHistory"],
        "scheduleProviderHistory": diag.get("scheduleProviderHistory", []),
        # Phase 7B-2 odds diagnostic fields
        "oddsProviderStatus": odds_diag["odds_provider_status"],
        "oddsFetchAttempted": odds_diag["fetch_attempted"],
        "oddsFetchSucceeded": odds_diag["fetch_succeeded"],
        "oddsFailureReason": odds_diag["failure_reason"],
        "rawOddsEventCount": odds_diag["raw_event_count"],
        "matchedOddsEventCount": odds_diag["matched_event_count"],
        "attemptedOddsEventCount": odds_diag["attempted_event_count"],
        "parsedPropCount": odds_diag["parsed_prop_count"],
        "oddsCacheStatus": odds_diag["cache_status"],
        "oddsCachedAt": odds_diag["cached_at"],
        "oddsQuotaRemaining": odds_diag["quota_remaining"],
        "oddsQuotaUsed": odds_diag["quota_used"],
        "oddsLastCallCost": odds_diag["last_call_cost"],
        "oddsCostEstimatePerRun": odds_diag["cost_estimate_per_run"],
        "oddsBookmakers": odds_diag["bookmakers"],
        "oddsMarketsRequested": odds_diag["markets_requested"],
        "oddsRegions": odds_diag["regions"],
    }

    return {
        "board": board,
        "slate_day": slate_day,
        "log_entries": log_entries,
        "trends_for_player": trends_for_player,
        "player_meta": player_meta,
        "schedule_source": schedule_source,
        "odds_source": odds_diag["odds_source"],
        "schedule_is_demo": False,
        "odds_is_demo": False,
        "data_mode": final_data_mode,
    }


def _resolve_odds_for_date(
    target_date: str,
    *,
    games: list[dict],
    odds_mode: str,
    has_odds_key: bool,
    skip: bool,
) -> dict:
    """Returns a normalized odds diag dict consumed by _build_real_payload.

    Output dict keys:
        props (list[PropLine]),
        odds_source (str: "the_odds_api" | "unavailable" | "demo"),
        odds_provider_status (one of ODDS_STATUS_*),
        fetch_attempted, fetch_succeeded, failure_reason,
        raw_event_count, matched_event_count, attempted_event_count,
        parsed_prop_count, cache_status, cached_at,
        quota_remaining, quota_used, last_call_cost,
        cost_estimate_per_run, bookmakers, markets_requested, regions
    """
    # Default: not configured / not attempted
    base = {
        "props": [],
        "odds_source": "unavailable",
        "odds_provider_status": ODDS_STATUS_NOT_CONFIGURED,
        "fetch_attempted": False,
        "fetch_succeeded": False,
        "failure_reason": None,
        "raw_event_count": 0,
        "matched_event_count": 0,
        "attempted_event_count": 0,
        "parsed_prop_count": 0,
        "cache_status": "miss",
        "cached_at": None,
        "quota_remaining": None,
        "quota_used": None,
        "last_call_cost": None,
        "cost_estimate_per_run": 0,
        "bookmakers": list(C.ODDS_BOOKMAKERS),
        "markets_requested": list(C.ODDS_MARKETS),
        "regions": ",".join(C.ODDS_REGIONS),
    }

    # Skip when there's no schedule to attach props to, or when explicitly
    # disabled, or when no key is set.
    if skip:
        log.info("  odds: skipped (no real schedule to attach props to)")
        return base

    if odds_mode == "demo":
        # Real schedule + explicit demo odds — don't run, don't fabricate.
        # The orchestrator will route through DemoForced earlier than this,
        # so this branch is defensive.
        base["failure_reason"] = "ODDS_DATA_MODE=demo on real schedule path"
        return base

    if not has_odds_key:
        log.info("  odds: ODDS_API_KEY not set → status=not_configured")
        return base

    # Phase 7B-3: dry-run mode. Hit /events (FREE) so we can confirm key
    # works and report what WOULD be fetched, but skip /odds calls.
    if C.ODDS_DRY_RUN:
        try:
            from .fetch_odds_data import fetch_events_only_with_diagnostics
            ev_diag = fetch_events_only_with_diagnostics(
                date=target_date,
                slate_games=games,
            )
        except Exception as e:
            log.warning(f"  odds: dry-run /events check failed: {e}")
            base["odds_source"] = "the_odds_api"
            base["odds_provider_status"] = ODDS_STATUS_FAILED
            base["fetch_attempted"] = True
            base["failure_reason"] = f"dry-run /events check failed: {e}"
            return base

        out = {**base}
        out["odds_source"] = "the_odds_api"
        out["odds_provider_status"] = ODDS_STATUS_DRY_RUN
        out["fetch_attempted"] = True
        out["fetch_succeeded"] = ev_diag["fetch_succeeded"]
        out["raw_event_count"] = ev_diag["raw_event_count"]
        out["matched_event_count"] = ev_diag["matched_event_count"]
        out["attempted_event_count"] = 0  # dry-run never calls /odds
        out["parsed_prop_count"] = 0
        out["cache_status"] = ev_diag["cache_status"]
        out["quota_remaining"] = ev_diag["quota_remaining"]
        out["quota_used"] = ev_diag["quota_used"]
        out["last_call_cost"] = 0
        out["cost_estimate_per_run"] = 0  # dry run burns 0 paid credits
        cost_per_event = max(1, len(C.ODDS_MARKETS)) * max(1, len(C.ODDS_REGIONS))
        would_fetch = min(out["matched_event_count"], C.ODDS_MAX_EVENTS_PER_RUN)
        would_cost = would_fetch * cost_per_event
        out["failure_reason"] = (
            f"ODDS_DRY_RUN=true — skipped /odds fetches. "
            f"Would have called /odds for {would_fetch} event(s), "
            f"costing ~{would_cost} credit(s)."
        )
        log.info(
            f"  odds: dry_run events_raw={out['raw_event_count']} "
            f"matched={out['matched_event_count']} would_fetch={would_fetch} "
            f"would_cost={would_cost} cache={out['cache_status']}"
        )
        return out

    # Try fetch
    try:
        from .fetch_odds_data import fetch_props_with_diagnostics
        diag = fetch_props_with_diagnostics(
            date=target_date,
            slate_games=games,
        )
    except Exception as e:
        log.warning(f"  odds: fetch failed: {e}")
        base["odds_source"] = "the_odds_api"
        base["odds_provider_status"] = ODDS_STATUS_FAILED
        base["fetch_attempted"] = True
        base["failure_reason"] = str(e)
        return base

    out = {**base}
    out["fetch_attempted"] = diag["fetch_attempted"]
    out["fetch_succeeded"] = diag["fetch_succeeded"]
    out["failure_reason"] = diag["failure_reason"]
    out["raw_event_count"] = diag["raw_event_count"]
    out["matched_event_count"] = diag["matched_event_count"]
    out["attempted_event_count"] = diag["attempted_event_count"]
    out["parsed_prop_count"] = diag["parsed_prop_count"]
    out["cache_status"] = diag["cache_status"]
    out["cached_at"] = diag["cached_at"]
    out["quota_remaining"] = diag["quota_remaining"]
    out["quota_used"] = diag["quota_used"]
    out["last_call_cost"] = diag["last_call_cost"]
    out["cost_estimate_per_run"] = diag["cost_estimate_per_run"]
    out["bookmakers"] = diag["bookmakers"]
    out["markets_requested"] = diag["markets_requested"]
    out["regions"] = diag["regions"]
    out["props"] = diag["props"]
    out["odds_source"] = "the_odds_api"

    # Decide odds_provider_status
    if diag["fetch_succeeded"] and diag["props"]:
        out["odds_provider_status"] = ODDS_STATUS_OK_WITH_PROPS
    elif diag["fetch_succeeded"]:
        out["odds_provider_status"] = ODDS_STATUS_OK_NO_PROPS
    else:
        out["odds_provider_status"] = ODDS_STATUS_FAILED

    log.info(
        f"  odds: {out['odds_provider_status']} "
        f"events_raw={out['raw_event_count']} matched={out['matched_event_count']} "
        f"props={out['parsed_prop_count']} cache={out['cache_status']}"
    )
    return out


# PR 8: props-only mode flag. Set in main() from args.props_only. When True,
# _score_real_props skips per-player nba_api game-log fetches and marks
# resolved leans as confidence='trends_pending'.
_PROPS_ONLY_MODE = False


def _score_real_props(
    *,
    target_date: str,
    games: list[dict],
    props,
    signals: list[NewsSignal],
    schedule_source: str,
    odds_source: str,
) -> tuple[list[dict], list, dict, dict]:
    """Score real props returned by The Odds API.

    Steps:
      1. Build a player_name → (team_abbr, opponent_abbr, game_id, tipoff,
         home_away) index by joining props (which carry _event_home_team,
         _event_away_team) against the slate games.
      2. For each prop, attempt to find player_id and game logs via the
         provider chain. If logs unavailable, mark "insufficient_data" but
         STILL include the prop card with no model lean.
      3. Build features, score the prop, attach news signals.
      4. Return leans payload + log entries.

    Never invents projections or odds.
    """
    # ------------------------------------------------------------------
    # Step 1 — build player context index
    # ------------------------------------------------------------------
    # Index slate games by (home_full, away_full) → game dict
    games_by_pair: dict[tuple[str, str], dict] = {}
    for g in games:
        h = (g.get("homeTeamFull") or "").lower().strip()
        a = (g.get("awayTeamFull") or "").lower().strip()
        if h and a:
            games_by_pair[(h, a)] = g

    # We don't always know which team a player plays for. To keep budget low
    # and avoid an extra round-trip per player, we attempt one strategy:
    # roster lookup for each team in the slate (cached). If that fails, we
    # leave team blank and label confidence = "insufficient_data".
    rosters_by_team: dict[str, list] = {}
    name_to_team: dict[str, str] = {}
    name_to_pid: dict[str, int] = {}

    def _normalize_name_key(name: str) -> str:
        """Strip diacritics + lowercase so prop names like 'Schroder'
        match roster names like 'Schröder'."""
        import unicodedata
        out = unicodedata.normalize("NFKD", name or "")
        out = "".join(c for c in out if not unicodedata.combining(c))
        return out.lower().strip()

    teams_seen: set[str] = set()
    for g in games:
        for abbr in (g.get("homeTeamAbbr"), g.get("awayTeamAbbr")):
            if abbr:
                teams_seen.add(abbr)

    for team_abbr in teams_seen:
        try:
            roster, _src = fetch_team_roster(team_abbr)
            rosters_by_team[team_abbr] = roster
            for p in roster:
                # Store BOTH the original name AND a diacritic-stripped
                # key — bookmakers often drop accent marks.
                name_to_team.setdefault(p.player_name, team_abbr)
                name_to_team.setdefault(_normalize_name_key(p.player_name), team_abbr)
                # PR 6: provider-supplied playerIds are NOT NBA-canonical.
                # Observed failure: a roster provider returned id=1630224
                # for "Anthony Edwards", but in nba_api's static index that
                # id is Jalen Green. resolve_player_id below uses the
                # canonical static index instead. name_to_team is safe -
                # it maps name to team abbreviation, not id.
        except Exception as e:
            log.info(f"  roster for {team_abbr} unavailable: {e}")
            rosters_by_team[team_abbr] = []

    # ------------------------------------------------------------------
    # Step 2-4 — score each prop
    # ------------------------------------------------------------------
    leans_payload: list[dict] = []
    log_entries: list[LeanLogEntry] = []
    trends_for_player: dict[int, dict] = {}
    player_meta: dict[int, dict] = {}
    features_cache: dict[int, dict] = {}

    for p in props:
        ev_home = (getattr(p, "event_home_team", "") or "").lower().strip()
        ev_away = (getattr(p, "event_away_team", "") or "").lower().strip()
        game = games_by_pair.get((ev_home, ev_away))
        if not game:
            # The prop's event doesn't match any game in our slate — skip
            # silently rather than try to associate it.
            continue

        team_abbr = name_to_team.get(p.player_name) or name_to_team.get(_normalize_name_key(p.player_name), "")
        # Determine opponent based on which side the player is on
        if team_abbr == game.get("homeTeamAbbr"):
            home_away = "Home"
            opponent_abbr = game.get("awayTeamAbbr", "")
        elif team_abbr == game.get("awayTeamAbbr"):
            home_away = "Away"
            opponent_abbr = game.get("homeTeamAbbr", "")
        else:
            # Player not found in either roster — fall back to game-level
            # info without team attribution.
            home_away = "Home"
            opponent_abbr = ""

        # PR 6: canonical resolver via nba_api static index. Returns 0
        # when no confident match - caller marks confidence=insufficient_data.
        player_id, _resolve_conf = resolve_player_id(p.player_name)

        # Fetch features if we have an ID and haven't already
        scored = None
        confidence = "insufficient_data"
        projection = None
        model_prob = None
        edge_pct = None
        reason = "insufficient_data: no player game logs available"

        # PR 8: props-only mode skips the slow nba_api game-log fetch entirely.
        # Resolved players still get playerId set; confidence becomes
        # 'trends_pending' (set below) instead of being scored.
        if player_id and not _PROPS_ONLY_MODE and player_id not in features_cache:
            try:
                logs, _src = fetch_player_game_logs(
                    player_id, last_n=C.GAME_LOG_WINDOW,
                )
                if logs:
                    features_cache[player_id] = build_player_features(logs)
                    trends_for_player[player_id] = build_trend_payload(logs)
                    player_meta[player_id] = {
                        "playerId": player_id,
                        "playerName": p.player_name,
                        "team": team_abbr,
                    }
            except Exception as e:
                log.info(f"  game logs for {p.player_name} unavailable: {e}")

        feats = features_cache.get(player_id)

        # PR 8: in props-only mode, mark resolved-but-unfetched players as
        # trends_pending so Parlay Lab + UI differentiate "real prop, projection
        # coming" from "no data available at all".
        if _PROPS_ONLY_MODE and player_id and feats is None:
            confidence = "trends_pending"
            reason = "trends_pending: projection will be attached in enrichment pass"

        if feats is not None:
            scored = score_prop(
                features=feats,
                market=p.market,
                line=p.line,
                odds_over=p.odds_over,
                odds_under=p.odds_under,
                home_away=home_away,
                player_name=p.player_name,
            )
            confidence = scored.confidence
            projection = scored.projection
            model_prob = scored.model_probability
            edge_pct = scored.edge_pct
            reason = scored.reason

        # Implied probability (always computable from odds even without a model)
        from .score_model import american_to_probability, devig_two_way
        raw_over = american_to_probability(p.odds_over)
        raw_under = american_to_probability(p.odds_under)
        p_over_implied, _p_under_implied = devig_two_way(raw_over, raw_under)

        # Apply news signals
        matched = signals_for_lean(
            signals,
            player_name=p.player_name,
            team=team_abbr,
            game_id=game.get("gameId"),
        )
        news_action = aggregate_model_action(matched)
        risk_flags: list[str] = []
        confidence_final = confidence
        if news_action == "remove_from_board":
            confidence_final = "no_play"
            risk_flags.append("news_remove")
        elif news_action == "manual_review_required":
            confidence_final = "no_play"
            risk_flags.append("news_manual_review")
        elif news_action == "flag_risk":
            risk_flags.append("news_risk_flag")
            if confidence_final == "High":
                confidence_final = "Medium"

        # Source reliability — Phase 7B-2 v1: a reasonable static blend
        sched_rel = 0.85 if schedule_source == "nba_api" else 0.80
        odds_rel = 0.80
        news_rel = max((s.sourceReliability for s in matched), default=0.85)
        source_rel = round((sched_rel + odds_rel + news_rel) / 3.0, 2)

        # Pick type — explicit, conservative
        if confidence_final == "no_play":
            pick_type = "no_play"
            lean = "Pass"
        elif confidence_final == "insufficient_data":
            pick_type = "no_play"
            lean = "Pass"
        elif confidence_final == "trends_pending":
            # PR 8: real prop with resolved playerId but projection pending.
            # Non-actionable until enrichment completes.
            pick_type = "no_play"
            lean = "Pass"
        elif scored is not None:
            pick_type = "model_lean"
            lean = scored.lean
        else:
            pick_type = "no_play"
            lean = "Pass"

        lean_id = f"{target_date}-{player_id or p.player_name.replace(' ', '_')}-{p.market}"
        leans_payload.append({
            "id": lean_id,
            "date": target_date,
            "tipoff": game.get("tipoff", "TBD"),
            "playerId": player_id,
            "playerName": p.player_name,
            "team": team_abbr,
            "teamFullName": _team_full_name(team_abbr),
            "opponent": opponent_abbr,
            "opponentFullName": _team_full_name(opponent_abbr),
            "homeAway": home_away,
            "market": p.market,
            "line": p.line,
            "oddsOver": p.odds_over,
            "oddsUnder": p.odds_under,
            "bookmaker": p.bookmaker,
            "oddsSource": odds_source,
            "projection": projection,
            "modelProjection": projection,
            "modelProbability": model_prob,
            "impliedProbability": p_over_implied,
            "edgePct": edge_pct,
            "edge": edge_pct,
            "lean": lean,
            "pickType": pick_type,
            "confidence": confidence_final,
            "reason": reason,
            "status": "Pending",
            "gameId": game.get("gameId"),
            "newsSignals": signals_to_json(matched),
            "newsAction": news_action,
            "riskFlags": risk_flags,
            "sourceReliability": source_rel,
            "sourceReliabilityScore": source_rel,
            "isDemo": False,
        })

        log_entries.append(LeanLogEntry(
            leanId=lean_id, generatedAt=now_iso(), date=target_date,
            gameId=game.get("gameId"), playerId=player_id or None,
            playerName=p.player_name, team=team_abbr,
            opponent=opponent_abbr, market=p.market, line=p.line,
            oddsOver=p.odds_over, oddsUnder=p.odds_under,
            bookmaker=p.bookmaker, oddsSource=odds_source,
            statsSource=schedule_source,
            modelProjection=projection,
            modelProbability=model_prob,
            impliedProbability=p_over_implied,
            edgePct=edge_pct, confidence=confidence_final,
            sourceReliabilityScore=source_rel,
            newsSignalIds=[s.id for s in matched],
            riskFlags=risk_flags,
        ))

    return leans_payload, log_entries, trends_for_player, player_meta


def _build_data_sources_list(
    schedule_source: str,
    odds_source: str,
) -> list[str]:
    out = []
    if schedule_source and schedule_source not in ("unavailable",):
        out.append(schedule_source)
    if odds_source and odds_source not in ("unavailable",):
        out.append(odds_source)
    return out


# ---------------------------------------------------------------------------
# Demo payload — only DemoForced (NBA_DATA_MODE=demo). Always tagged isDemo.
# ---------------------------------------------------------------------------
def _build_demo_payload(
    target_date: str,
    *,
    today: str,
    signals: list[NewsSignal],
    is_primary: bool,
) -> dict:
    """Demo schedule + demo props. Used only when the operator explicitly
    sets NBA_DATA_MODE=demo (or ODDS_DATA_MODE=demo).
    """
    games = _fetch_demo_schedule(target_date)
    props = _fetch_demo_props(target_date)

    games_payload = []
    game_for_team: dict[str, tuple[str, str, str, str]] = {}
    seen_pair: set[tuple[str, str]] = set()
    for g in games:
        pair = (g.home_team_abbr, g.away_team_abbr)
        if pair in seen_pair:
            continue
        seen_pair.add(pair)
        games_payload.append({
            "gameId": g.game_id,
            "date": g.date,
            "tipoff": g.tipoff_et or "TBD",
            "homeTeamAbbr": g.home_team_abbr,
            "homeTeamFull": g.home_team_full,
            "awayTeamAbbr": g.away_team_abbr,
            "awayTeamFull": g.away_team_full,
            "status": g.status,
        })
        game_for_team[g.home_team_abbr] = (
            g.tipoff_et or "TBD", "Home", g.away_team_abbr, g.game_id,
        )
        game_for_team[g.away_team_abbr] = (
            g.tipoff_et or "TBD", "Away", g.home_team_abbr, g.game_id,
        )

    # Hydrate player IDs from demo trends.json by name
    unique_players: dict[int, str] = {}
    for p in props:
        if p.player_id and p.player_id not in unique_players:
            unique_players[p.player_id] = p.player_name
    if not unique_players:
        trends_path = C.DEMO_DATA_DIR / "trends.json"
        if trends_path.exists():
            tdata = json.loads(trends_path.read_text())
            for p in props:
                if p.player_name and p.player_id == 0:
                    for tp in tdata.get("players", []):
                        if tp["playerName"] == p.player_name:
                            unique_players[int(tp["playerId"])] = p.player_name
                            break

    features_for_player: dict[int, dict] = {}
    trends_for_player: dict[int, dict] = {}
    player_meta: dict[int, dict] = {}

    for pid, pname in unique_players.items():
        try:
            logs, _src = fetch_player_game_logs(pid, last_n=C.GAME_LOG_WINDOW)
        except Exception as e:
            log.warning(f"  game logs failed for {pname}: {e}")
            continue
        if not logs:
            continue
        features_for_player[pid] = build_player_features(logs)
        trends_for_player[pid] = build_trend_payload(logs)
        player_meta[pid] = {"playerId": pid, "playerName": pname, "team": ""}

    name_to_team: dict[str, str] = {}
    for p in props:
        if p.player_name and p.team_abbr:
            name_to_team.setdefault(p.player_name, p.team_abbr)
    for pid, m in player_meta.items():
        m["team"] = name_to_team.get(m["playerName"], "")

    # Score every demo prop
    leans_payload: list[dict] = []
    log_entries: list[LeanLogEntry] = []

    for p in props:
        pid = p.player_id
        if pid == 0 or pid not in features_for_player:
            for known_pid, known_name in unique_players.items():
                if known_name == p.player_name:
                    pid = known_pid
                    break

        feats = features_for_player.get(pid)
        if not feats:
            continue

        tipoff, home_away, opponent_abbr, game_id = game_for_team.get(
            p.team_abbr, ("TBD", "Home", "", None)
        )

        scored = score_prop(
            features=feats, market=p.market, line=p.line,
            odds_over=p.odds_over, odds_under=p.odds_under,
            home_away=home_away, player_name=p.player_name,
        )

        matched = signals_for_lean(
            signals,
            player_name=p.player_name,
            team=p.team_abbr,
            game_id=game_id,
        )
        news_action = aggregate_model_action(matched)

        confidence_final = scored.confidence
        risk_flags: list[str] = []
        if news_action == "remove_from_board":
            confidence_final = "Low"
            risk_flags.append("news_remove")
        elif news_action == "manual_review_required":
            confidence_final = "Low"
            risk_flags.append("news_manual_review")
        elif news_action == "flag_risk":
            risk_flags.append("news_risk_flag")
            if confidence_final == "High":
                confidence_final = "Medium"

        sched_rel = 0.5
        odds_rel = 0.5
        news_rel = max((s.sourceReliability for s in matched), default=0.85)
        source_rel = round((sched_rel + odds_rel + news_rel) / 3.0, 2)

        lean_id = f"{target_date}-{pid}-{p.market}"
        leans_payload.append({
            "id": lean_id,
            "date": target_date,
            "tipoff": tipoff,
            "playerId": pid,
            "playerName": p.player_name,
            "team": p.team_abbr,
            "teamFullName": _team_full_name(p.team_abbr),
            "opponent": opponent_abbr,
            "opponentFullName": _team_full_name(opponent_abbr),
            "homeAway": home_away,
            "market": p.market,
            "line": p.line,
            "oddsOver": p.odds_over,
            "oddsUnder": p.odds_under,
            "bookmaker": p.bookmaker,
            "projection": scored.projection,
            "modelProbability": scored.model_probability,
            "impliedProbability": scored.implied_probability,
            "edgePct": scored.edge_pct,
            "lean": scored.lean,
            "confidence": confidence_final,
            "reason": scored.reason,
            "status": "Pending",
            "gameId": game_id,
            "newsSignals": signals_to_json(matched),
            "newsAction": news_action,
            "riskFlags": risk_flags,
            "sourceReliability": source_rel,
            "isDemo": True,
        })

        log_entries.append(LeanLogEntry(
            leanId=lean_id, generatedAt=now_iso(), date=target_date,
            gameId=game_id, playerId=pid if pid else None,
            playerName=p.player_name, team=p.team_abbr,
            opponent=opponent_abbr, market=p.market, line=p.line,
            oddsOver=p.odds_over, oddsUnder=p.odds_under,
            bookmaker=p.bookmaker, oddsSource="demo",
            statsSource="demo", modelProjection=scored.projection,
            modelProbability=scored.model_probability,
            impliedProbability=scored.implied_probability,
            edgePct=scored.edge_pct, confidence=confidence_final,
            sourceReliabilityScore=source_rel,
            newsSignalIds=[s.id for s in matched],
            riskFlags=risk_flags,
        ))

    log.info(f"  scored {len(leans_payload)} demo leans")

    # PR 19: same guardrail pass for demo data so demo board semantics
    # match production — same audit fields, same post-cap counts.
    leans_payload, _guardrail_summary_demo = apply_to_leans(leans_payload)

    high_conf = sum(1 for l in leans_payload if l["confidence"] == "High")

    slate_day = {
        "date": target_date,
        "dayLabel": day_label(target_date, today),
        "isAvailable": True,
        "gameCount": len(games_payload),
        "leanCount": len(leans_payload),
        "highConfidenceCount": high_conf,
        "propsAvailable": True,  # demo has fake props by definition
        "isPrimary": is_primary,
        "scheduleSource": "demo",
        "oddsSource": "demo",
        "isDemo": True,
        "dataMode": DATA_MODE_DEMO_FORCED,
        "failureReason": None,
        "oddsProviderStatus": ODDS_STATUS_DEMO,
    }

    board = {
        "generatedFor": target_date,
        "generatedAt": now_iso(),
        "dataSources": ["demo"],
        "isDemo": True,
        "leans": leans_payload,
        "scheduleAvailable": True,
        "propsAvailable": True,
        "scheduleSource": "demo",
        "oddsSource": "demo",
        "games": games_payload,
        "dataMode": DATA_MODE_DEMO_FORCED,
        "failureReason": None,
        "requestedDate": target_date,
        "timezone": C.TIMEZONE,
        "scheduleProviderStatus": "ok",
        "scheduleFetchAttempted": False,
        "scheduleFetchSucceeded": False,
        "scheduleFailureReason": None,
        "rawGameCountBeforeFiltering": len(games_payload),
        "parsedGameCountAfterFiltering": len(games_payload),
        "manualOverrideUsed": False,
        "manualOverrideSource": None,
        "endpointHistory": [],
        "scheduleProviderHistory": [],
        # Phase 7B-2 odds diagnostic fields (demo path values)
        "oddsProviderStatus": ODDS_STATUS_DEMO,
        "oddsFetchAttempted": False,
        "oddsFetchSucceeded": False,
        "oddsFailureReason": None,
        "rawOddsEventCount": 0,
        "matchedOddsEventCount": 0,
        "attemptedOddsEventCount": 0,
        "parsedPropCount": len(leans_payload),
        "oddsCacheStatus": None,
        "oddsCachedAt": None,
        "oddsQuotaRemaining": None,
        "oddsQuotaUsed": None,
        "oddsLastCallCost": None,
        "oddsCostEstimatePerRun": 0,
        "oddsBookmakers": [],
        "oddsMarketsRequested": list(C.ODDS_MARKETS),
        "oddsRegions": ",".join(C.ODDS_REGIONS),
    }

    return {
        "board": board,
        "slate_day": slate_day,
        "log_entries": log_entries,
        "trends_for_player": trends_for_player,
        "player_meta": player_meta,
        "schedule_source": "demo",
        "odds_source": "demo",
        "schedule_is_demo": True,
        "odds_is_demo": True,
        "data_mode": DATA_MODE_DEMO_FORCED,
    }


def _fetch_demo_schedule(date: str) -> list:
    try:
        from .providers.demo_provider import DemoNBAProvider
        return DemoNBAProvider().fetch_schedule(date)
    except Exception as e:
        log.error(f"demo schedule failed: {e}")
        return []


def _fetch_demo_props(date: str) -> list:
    try:
        from .providers.demo_provider import DemoOddsProvider
        return DemoOddsProvider().fetch_props(date)
    except Exception as e:
        log.error(f"demo props failed: {e}")
        return []


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> int:
    parser = argparse.ArgumentParser(description="Generate the multi-day model board")
    parser.add_argument("--date", default=None)
    parser.add_argument("--days", type=int, default=None)
    parser.add_argument("--out", default=None)
    parser.add_argument(
        "--props-only",
        action="store_true",
        help=(
            "PR 8: skip nba_api game-log fetches and projection scoring. "
            "Writes board with resolved playerIds and real prop data; leans "
            "with playerId>0 get confidence='trends_pending'. Use for fast "
            "paid refresh; pair with a follow-up enrichment run (same "
            "script without the flag)."
        ),
    )
    args = parser.parse_args()
    # PR 8: surface props-only flag at module scope so _score_real_props
    # (which doesn't take it as a parameter) can read it without a wider
    # function-signature change.
    global _PROPS_ONLY_MODE
    _PROPS_ONLY_MODE = bool(args.props_only)

    today = args.date or today_in_tz()
    n_days = args.days or C.SLATE_DAYS
    out_dir = Path(args.out) if args.out else C.DATA_OUT
    out_dir.mkdir(parents=True, exist_ok=True)
    boards_dir = out_dir / "boards"
    boards_dir.mkdir(parents=True, exist_ok=True)

    nba_mode = (C.NBA_DATA_MODE or "auto").lower()
    odds_mode = (C.ODDS_DATA_MODE or "auto").lower()
    has_odds_key = bool(C.ODDS_API_KEY)

    log.info(f"=== Slate: {today} + {n_days - 1} days ===")
    log.info(f"NBA_DATA_MODE={nba_mode}, ODDS_DATA_MODE={odds_mode}, has_odds_key={has_odds_key}")
    log.info(f"manual schedule overrides: {SCHEDULE_OVERRIDES_PATH.name} "
             f"({'present' if has_schedule_overrides_file() else 'missing'})")

    signals = load_signals()
    log.info(f"manual news signals: {len(signals)} active")

    dates = slate_dates(today, n_days)
    per_date_results: list[dict] = []
    all_log_entries: list[LeanLogEntry] = []

    for date in dates:
        is_primary = (date == today)
        result = generate_for_date(
            date,
            today=today,
            signals=signals,
            is_primary=is_primary,
            nba_mode=nba_mode,
            odds_mode=odds_mode,
            has_odds_key=has_odds_key,
        )
        per_date_results.append(result)
        all_log_entries.extend(result["log_entries"])
        _write_json(boards_dir / f"{date}.json", result["board"])

    # slate.json
    overall_data_mode = _compute_overall_mode(per_date_results)
    slate_payload = {
        "generatedAt": now_iso(),
        "primaryDate": today,
        "slateDays": n_days,
        "days": [r["slate_day"] for r in per_date_results],
        "newsSignalsActive": len(signals),
        "newsSignalsConfigured": _has_news_signals_file(),
        "scheduleOverridesConfigured": has_schedule_overrides_file(),
        "dataMode": overall_data_mode,
    }
    _write_json(out_dir / "slate.json", slate_payload)

    # Today's data — board.json (back-compat) etc.
    today_result = next(r for r in per_date_results if r["slate_day"]["isPrimary"])
    today_board = today_result["board"]
    _write_json(out_dir / "board.json", today_board)

    schedule_file = {
        "generatedAt": now_iso(),
        "source": today_result["schedule_source"],
        "isDemo": today_result["schedule_is_demo"],
        "date": today,
        "games": today_board["games"],
    }
    _write_json(out_dir / "schedule.json", schedule_file)

    odds_props_file = {
        "generatedAt": now_iso(),
        "source": today_result["odds_source"],
        "isDemo": today_result["odds_is_demo"],
        "date": today,
        "props": [],
    }
    _write_json(out_dir / "odds_props.json", odds_props_file)

    players_file = {
        "generatedAt": now_iso(),
        "isDemo": today_result["schedule_is_demo"],
        "players": list(today_result["player_meta"].values()),
    }
    _write_json(out_dir / "players.json", players_file)

    trends = {
        "generatedAt": now_iso(),
        "isDemo": today_result["schedule_is_demo"],
        "players": [
            {
                "playerId": pid,
                "playerName": today_result["player_meta"].get(pid, {}).get("playerName", ""),
                "team": today_result["player_meta"].get(pid, {}).get("team", ""),
                "position": "",
                **today_result["trends_for_player"][pid],
            }
            for pid in today_result["trends_for_player"]
        ],
    }
    if not trends["players"]:
        existing = out_dir / "trends.json"
        if existing.exists():
            log.info("  trends.json preserved (no fresh trends this run)")
        else:
            _write_json(out_dir / "trends.json", trends)
    else:
        _write_json(out_dir / "trends.json", trends)

    # meta.json
    meta = {
        "appName": "GametimePicks",
        "version": "0.5.0",
        "lastPipelineRun": now_iso(),
        "isDemo": all(r["slate_day"]["isDemo"] for r in per_date_results),
        "dataMode": overall_data_mode,
        "nbaScheduleSource": today_result["schedule_source"],
        "nbaStatsSource": today_result["schedule_source"],
        "oddsSource": today_result["odds_source"],
        "activeProvider": {
            "nba": today_result["schedule_source"],
            "odds": today_result["odds_source"],
        },
        "providerStatuses": [s.to_dict() for s in all_provider_statuses()],
        "fallbackSourcesAvailable": _fallback_summary(),
        "lastSuccessfulFetch": now_iso(),
        "dataSources": [
            {"name": "demo data", "description": "Bundled offline fallback.", "url": ""},
            {"name": "nba_api", "description": "Official NBA Stats endpoints.", "url": "https://github.com/swar/nba_api"},
            {"name": "manual schedule overrides", "description": "Operator-verified schedule safety net.", "url": ""},
            {"name": "The Odds API", "description": "Free-tier sportsbook odds.", "url": "https://the-odds-api.com/"},
            {"name": "manual news overrides", "description": "Human-confirmed news signals.", "url": ""},
        ],
        "slateDays": n_days,
        "primaryDate": today,
        "newsSignalsConfigured": _has_news_signals_file(),
        "newsSignalsActive": len(signals),
        "scheduleOverridesConfigured": has_schedule_overrides_file(),
        "todayDataMode": today_result["data_mode"],
        "todayFailureReason": today_result["board"].get("failureReason"),
        "todayManualOverrideUsed": today_result["board"].get("manualOverrideUsed", False),
        # Phase 7B-2 odds metadata
        "oddsApiKeyConfigured": bool(C.ODDS_API_KEY),
        "todayOddsProviderStatus": today_result["board"].get("oddsProviderStatus"),
        "todayOddsFailureReason": today_result["board"].get("oddsFailureReason"),
        "todayOddsQuotaRemaining": today_result["board"].get("oddsQuotaRemaining"),
        "todayParsedPropCount": today_result["board"].get("parsedPropCount", 0),
        "oddsBookmakersConfigured": list(C.ODDS_BOOKMAKERS),
        "oddsMarketsConfigured": list(C.ODDS_MARKETS),
        "oddsRegionsConfigured": ",".join(C.ODDS_REGIONS),
        "oddsCacheTtlMinutes": C.ODDS_CACHE_TTL_MINUTES,
        "oddsMaxEventsPerRun": C.ODDS_MAX_EVENTS_PER_RUN,
    }
    _write_json(out_dir / "meta.json", meta)

    # hit_rates.json — preserve or seed
    hr_target = out_dir / "hit_rates.json"
    if not hr_target.exists():
        demo_hr = C.DEMO_DATA_DIR / "hit_rates.json"
        if demo_hr.exists():
            hr_target.write_text(demo_hr.read_text())

    if all_log_entries:
        append_entries(all_log_entries)

    total_games = sum(r["slate_day"]["gameCount"] for r in per_date_results)
    total_leans = sum(r["slate_day"]["leanCount"] for r in per_date_results)
    log.info(
        f"=== Done. todayMode={today_result['data_mode']}. "
        f"{len(dates)} days, {total_games} games, {total_leans} leans ==="
    )
    return 0


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
TEAM_FULL_NAMES = {
    "ATL": "Atlanta Hawks", "BOS": "Boston Celtics", "BKN": "Brooklyn Nets",
    "CHA": "Charlotte Hornets", "CHI": "Chicago Bulls", "CLE": "Cleveland Cavaliers",
    "DAL": "Dallas Mavericks", "DEN": "Denver Nuggets", "DET": "Detroit Pistons",
    "GSW": "Golden State Warriors", "HOU": "Houston Rockets", "IND": "Indiana Pacers",
    "LAC": "LA Clippers", "LAL": "Los Angeles Lakers", "MEM": "Memphis Grizzlies",
    "MIA": "Miami Heat", "MIL": "Milwaukee Bucks", "MIN": "Minnesota Timberwolves",
    "NOP": "New Orleans Pelicans", "NYK": "New York Knicks",
    "OKC": "Oklahoma City Thunder", "ORL": "Orlando Magic", "PHI": "Philadelphia 76ers",
    "PHX": "Phoenix Suns", "POR": "Portland Trail Blazers", "SAC": "Sacramento Kings",
    "SAS": "San Antonio Spurs", "TOR": "Toronto Raptors", "UTA": "Utah Jazz",
    "WAS": "Washington Wizards",
}


def _team_full_name(abbr: str) -> str:
    return TEAM_FULL_NAMES.get(abbr, abbr)


def _fallback_summary() -> dict[str, str]:
    return {
        "espn": "enabled" if C.ENABLE_ESPN_FALLBACK else "disabled",
        "balldontlie": "enabled" if C.ENABLE_BALLDONTLIE_FALLBACK else "disabled",
        "opticodds": "enabled" if C.ENABLE_OPTICODDS else "disabled",
        "sportsdata": "enabled" if C.ENABLE_SPORTSDATA else "disabled",
    }


def _has_news_signals_file() -> bool:
    from .manual_overrides import DEFAULT_PATH
    return DEFAULT_PATH.exists()


def _split_bookmakers(s: str) -> list[str]:
    """Phase 7B-2: split comma-separated bookmaker keys for meta.json."""
    if not s:
        return []
    return [b.strip() for b in s.split(",") if b.strip()]


def _compute_overall_mode(results: list[dict]) -> str:
    """Slate-wide mode = today's mode."""
    today_result = next(
        (r for r in results if r["slate_day"]["isPrimary"]),
        results[0] if results else None,
    )
    return today_result["data_mode"] if today_result else DATA_MODE_SCHEDULE_UNAVAIL


def _write_json(path: Path, payload: dict | list) -> None:
    # PR 8: atomic write (write to .tmp, then rename) so a kill mid-write
    # never leaves a partially-truncated board file on disk.
    path.parent.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(payload, indent=2)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(serialized)
    tmp.replace(path)  # atomic on POSIX
    log.info(f"  wrote {path.name} ({len(serialized)} bytes)")


if __name__ == "__main__":
    raise SystemExit(main())
