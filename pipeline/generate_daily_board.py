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
# Schedule resolution — the heart of Phase 7B-1.2
# ---------------------------------------------------------------------------
def resolve_schedule_for_date(date: str) -> dict:
    """Returns a dict with games, dataMode, and full diagnostic metadata.

    Used by generate_for_date() — the orchestrator never calls nba_api or
    the override loader directly, so the resolution logic is in one place.
    """
    diag = {
        "requestedDate": date,
        "timezone": C.TIMEZONE,
        "scheduleSource": None,           # "nba_api" | "manual" | "unavailable"
        "scheduleProviderStatus": None,   # "ok" | "failed" | "empty"
        "scheduleFetchAttempted": False,
        "scheduleFetchSucceeded": False,
        "scheduleFailureReason": None,
        "rawGameCountBeforeFiltering": 0,
        "parsedGameCountAfterFiltering": 0,
        "manualOverrideUsed": False,
        "manualOverrideSource": None,
        "endpointHistory": [],
    }

    # ------------------------------------------------------------------
    # Try nba_api first
    # ------------------------------------------------------------------
    nba_diag = _try_nba_api_schedule(date)
    diag["scheduleFetchAttempted"] = nba_diag["fetch_attempted"]
    diag["scheduleFetchSucceeded"] = nba_diag["fetch_succeeded"]
    diag["scheduleFailureReason"] = nba_diag["failure_reason"]
    diag["rawGameCountBeforeFiltering"] = nba_diag["raw_count_before"]
    diag["parsedGameCountAfterFiltering"] = nba_diag["parsed_count_after"]
    diag["endpointHistory"] = nba_diag["endpoint_history"]

    nba_games = nba_diag["games"]

    if nba_games:
        # nba_api returned games — use them
        diag["scheduleSource"] = "nba_api"
        diag["scheduleProviderStatus"] = "ok"
        return {
            "games": nba_games,
            "dataMode": DATA_MODE_SCHEDULE_ONLY,
            "diag": diag,
        }

    # ------------------------------------------------------------------
    # nba_api had no games — try manual override
    # ------------------------------------------------------------------
    override = load_schedule_override(date)
    if override and override.games:
        diag["scheduleSource"] = "manual"
        diag["scheduleProviderStatus"] = "ok"  # manual is "ok"
        diag["manualOverrideUsed"] = True
        diag["manualOverrideSource"] = override.sourceName
        diag["parsedGameCountAfterFiltering"] = len(override.games)
        return {
            "games": override.games,
            "dataMode": DATA_MODE_SCHEDULE_ONLY,
            "diag": diag,
        }

    # ------------------------------------------------------------------
    # No manual override — distinguish "provider confirmed empty" from
    # "provider failed". This is the bug Phase 7B-1.2 fixes.
    # ------------------------------------------------------------------
    if nba_diag["fetch_succeeded"]:
        # All endpoints succeeded but returned no games for this date
        diag["scheduleSource"] = "nba_api"
        diag["scheduleProviderStatus"] = "empty"
        return {
            "games": [],
            "dataMode": DATA_MODE_NO_GAMES,
            "diag": diag,
        }

    # nba_api failed completely AND no manual override → ScheduleUnavailable
    diag["scheduleSource"] = "unavailable"
    diag["scheduleProviderStatus"] = "failed"
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
        # Normalize keys (provider returns its own dict shape)
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
        is_primary=is_primary,
        games=games,
        data_mode=data_mode,
        diag=diag,
    )


# ---------------------------------------------------------------------------
# Real-schedule payload (all non-demo states)
# ---------------------------------------------------------------------------
def _build_real_payload(
    target_date: str,
    *,
    today: str,
    is_primary: bool,
    games: list[dict],
    data_mode: str,
    diag: dict,
) -> dict:
    """Real schedule (or empty/unavailable). NEVER produces demo prop cards."""
    schedule_source = diag["scheduleSource"] or "unavailable"

    slate_day = {
        "date": target_date,
        "dayLabel": day_label(target_date, today),
        # isAvailable means "we have something to show" — true for games OR for NoGames
        # but false for ScheduleUnavailable
        "isAvailable": data_mode != DATA_MODE_SCHEDULE_UNAVAIL,
        "gameCount": len(games),
        "leanCount": 0,
        "highConfidenceCount": 0,
        "propsAvailable": False,
        "isPrimary": is_primary,
        "scheduleSource": schedule_source,
        "oddsSource": None,
        "isDemo": False,
        "dataMode": data_mode,
        "failureReason": diag["scheduleFailureReason"],
    }

    board = {
        "generatedFor": target_date,
        "generatedAt": now_iso(),
        "dataSources": [schedule_source] if schedule_source else [],
        "isDemo": False,
        "leans": [],
        "scheduleAvailable": data_mode != DATA_MODE_SCHEDULE_UNAVAIL,
        "propsAvailable": False,
        "scheduleSource": schedule_source,
        "oddsSource": None,
        "games": games,
        "dataMode": data_mode,
        "failureReason": diag["scheduleFailureReason"],
        # Phase 7B-1.2 diagnostic fields
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
    }

    return {
        "board": board,
        "slate_day": slate_day,
        "log_entries": [],
        "trends_for_player": {},
        "player_meta": {},
        "schedule_source": schedule_source,
        "odds_source": "unavailable",
        "schedule_is_demo": False,
        "odds_is_demo": False,
        "data_mode": data_mode,
    }


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
    high_conf = sum(1 for l in leans_payload if l["confidence"] == "High")

    slate_day = {
        "date": target_date,
        "dayLabel": day_label(target_date, today),
        "isAvailable": True,
        "gameCount": len(games_payload),
        "leanCount": len(leans_payload),
        "highConfidenceCount": high_conf,
        "propsAvailable": False,
        "isPrimary": is_primary,
        "scheduleSource": "demo",
        "oddsSource": "demo",
        "isDemo": True,
        "dataMode": DATA_MODE_DEMO_FORCED,
        "failureReason": None,
    }

    board = {
        "generatedFor": target_date,
        "generatedAt": now_iso(),
        "dataSources": ["demo"],
        "isDemo": True,
        "leans": leans_payload,
        "scheduleAvailable": True,
        "propsAvailable": False,
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
    args = parser.parse_args()

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
        "version": "0.4.2",
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
            {"name": "The Odds API", "description": "Compliant sportsbook odds (Phase 7B-2).", "url": "https://the-odds-api.com/"},
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


def _compute_overall_mode(results: list[dict]) -> str:
    """Slate-wide mode = today's mode."""
    today_result = next(
        (r for r in results if r["slate_day"]["isPrimary"]),
        results[0] if results else None,
    )
    return today_result["data_mode"] if today_result else DATA_MODE_SCHEDULE_UNAVAIL


def _write_json(path: Path, payload: dict | list) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2))
    log.info(f"  wrote {path.name} ({len(json.dumps(payload))} bytes)")


if __name__ == "__main__":
    raise SystemExit(main())
