"""
Generate the multi-day model board.

Phase 7B-1: pipeline now runs for SLATE_DAYS dates starting today (default 4).
Each date produces its own boards/<date>.json. A top-level slate.json holds
the metadata for the full window (which days have games, which dates are the
primary tab, etc.).

For backward compatibility with the rest of the codebase, board.json (top
level) is a copy of today's board.

Free-only constraint: this orchestrator never calls a paid API. The Odds
API integration is deferred to Phase 7B-2 — for now, props/odds are
generated only by the demo provider (when in demo mode) and are reported
as unavailable when the Odds API key is not configured.

Designed to fail gracefully:
  - If nba_api is unreachable, schedule falls back to demo
  - If a future date has no real schedule, that day is marked isAvailable=false
  - News signals are read from manual_overrides/news_signals.json (local file,
    no network calls)
  - Validation log is appended even when leans count is zero
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
from .fetch_nba_schedule import fetch_schedule
from .fetch_nba_data import fetch_player_game_logs, fetch_team_roster
from .fetch_odds_data import fetch_props
from .build_features import build_player_features, build_trend_payload
from .score_model import score_prop
from .manual_overrides import (
    NewsSignal, load_signals, signals_for_lean,
    aggregate_model_action, signals_to_json,
)
from .validation import LeanLogEntry, append_entries


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("gtp.board")


# ---------------------------------------------------------------------------
# Date helpers
# ---------------------------------------------------------------------------
def today_in_tz() -> str:
    return datetime.now(ZoneInfo(C.TIMEZONE)).strftime("%Y-%m-%d")


def slate_dates(start_date: str, n: int) -> list[str]:
    """Return [start_date, start_date+1, ..., start_date+n-1]."""
    dt = datetime.strptime(start_date, "%Y-%m-%d").date()
    return [(dt + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(n)]


def day_label(target: str, today: str) -> str:
    """Render a friendly label for a slate tab.

    today        → "Today"
    today+1      → "Tomorrow"
    today+2/3    → "Tue May 5"
    """
    t_today = datetime.strptime(today, "%Y-%m-%d").date()
    t_target = datetime.strptime(target, "%Y-%m-%d").date()
    delta = (t_target - t_today).days
    if delta == 0:
        return "Today"
    if delta == 1:
        return "Tomorrow"
    return t_target.strftime("%a %b ").lstrip() + str(t_target.day)


def format_tipoff(game) -> str:
    """Use whatever the provider gave us. NBA.com formats tipoffs in their
    own style; demo provider gives a clean "7:30 PM ET" already."""
    return game.tipoff_et or "TBD"


# ---------------------------------------------------------------------------
# Per-date generation
# ---------------------------------------------------------------------------
def generate_for_date(
    target_date: str,
    *,
    today: str,
    signals: list[NewsSignal],
    is_primary: bool,
) -> dict:
    """Generate a board payload for one date and return it.

    Returns a dict with two top-level keys:
      - "board": payload to write to boards/<date>.json
      - "slate_day": SlateDay metadata for slate.json
      - "log_entries": LeanLogEntry rows for the validation log
      - "schedule_payload": games array (also returned by board)
      - "trends_for_player": for use by today's trends.json
      - "player_meta": for use by today's players.json
    """
    log.info(f"--- {target_date} ---")

    # ------------------------------------------------------------------
    # 1. Schedule
    # ------------------------------------------------------------------
    try:
        games, schedule_source = fetch_schedule(target_date)
    except Exception as e:
        log.warning(f"  schedule fetch failed: {e}")
        games, schedule_source = [], "demo"

    log.info(f"  schedule: {len(games)} games via {schedule_source}")

    sched_is_demo = schedule_source == "demo"
    schedule_available = (not sched_is_demo) and len(games) > 0

    # Map team_abbr → game info (for tipoff and home/away)
    game_for_team: dict[str, tuple[str, str, str, str]] = {}
    games_payload: list[dict] = []
    seen_pair: set[tuple[str, str]] = set()
    for g in games:
        # Dedup home-away pair (Phase 6 fix)
        pair = (g.home_team_abbr, g.away_team_abbr)
        if pair in seen_pair:
            continue
        seen_pair.add(pair)

        games_payload.append({
            "gameId": g.game_id,
            "date": g.date,
            "tipoff": format_tipoff(g),
            "homeTeamAbbr": g.home_team_abbr,
            "homeTeamFull": g.home_team_full,
            "awayTeamAbbr": g.away_team_abbr,
            "awayTeamFull": g.away_team_full,
            "status": g.status,
        })
        # (tipoff, home_away, opponent, gameId)
        game_for_team[g.home_team_abbr] = (
            format_tipoff(g), "Home", g.away_team_abbr, g.game_id,
        )
        game_for_team[g.away_team_abbr] = (
            format_tipoff(g), "Away", g.home_team_abbr, g.game_id,
        )

    # ------------------------------------------------------------------
    # 2. Odds / props
    # ------------------------------------------------------------------
    # Phase 7B-1: only call odds provider if not key-required OR demo mode.
    # The Odds API integration in fetch_props gracefully returns demo when
    # no key is set, so this is safe even with no key configured.
    try:
        props, odds_source = fetch_props(target_date, markets=list(C.MARKETS))
    except Exception as e:
        log.warning(f"  props fetch failed: {e}")
        props, odds_source = [], "demo"

    log.info(f"  props: {len(props)} prop lines via {odds_source}")

    odds_is_demo = odds_source == "demo"
    # Phase 7B-1 honesty rule: if no real ODDS_API_KEY configured AND we're
    # not in pure demo mode, treat odds as unavailable rather than fabricating.
    has_real_odds_key = bool(C.ODDS_API_KEY)
    if not has_real_odds_key and C.ODDS_DATA_MODE != "demo" and not sched_is_demo:
        # We have a real schedule but no odds key — tell the truth.
        log.info(f"  no ODDS_API_KEY configured; props marked unavailable")
        props = []
        odds_source = "unavailable"
        odds_is_demo = False

    props_available = (odds_source not in ("demo", "unavailable")) and len(props) > 0

    odds_payload = [
        {
            "playerId": p.player_id,
            "playerName": p.player_name,
            "teamAbbr": p.team_abbr,
            "market": p.market,
            "line": p.line,
            "oddsOver": p.odds_over,
            "oddsUnder": p.odds_under,
            "bookmaker": p.bookmaker,
            "gameDate": p.game_date,
            "lastUpdate": p.last_update,
        }
        for p in props
    ]

    # ------------------------------------------------------------------
    # 3. Per-player features (only if we actually have props to score)
    # ------------------------------------------------------------------
    unique_players: dict[int, str] = {}
    if props:
        for p in props:
            if p.player_id and p.player_id not in unique_players:
                unique_players[p.player_id] = p.player_name

        # Demo path: hydrate player IDs from trends.json by name
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

    log.info(f"  unique players to score: {len(unique_players)}")

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
        player_meta[pid] = {
            "playerId": pid,
            "playerName": pname,
            "team": "",
        }

    name_to_team: dict[str, str] = {}
    for p in props:
        if p.player_name and p.team_abbr:
            name_to_team.setdefault(p.player_name, p.team_abbr)
    for pid, m in player_meta.items():
        m["team"] = name_to_team.get(m["playerName"], "")

    # ------------------------------------------------------------------
    # 4. Score every prop
    # ------------------------------------------------------------------
    leans_payload: list[dict] = []
    log_entries: list[LeanLogEntry] = []

    for p in props:
        # Map player_id (may be 0 from odds API) to our hydrated id
        pid = p.player_id
        if pid == 0 or pid not in features_for_player:
            for known_pid, known_name in unique_players.items():
                if known_name == p.player_name:
                    pid = known_pid
                    break

        feats = features_for_player.get(pid)
        if not feats:
            log.warning(f"  no features for {p.player_name} ({p.market}) — skipping")
            continue

        tipoff, home_away, opponent_abbr, game_id = game_for_team.get(
            p.team_abbr, ("TBD", "Home", "", None)
        )

        scored = score_prop(
            features=feats,
            market=p.market,
            line=p.line,
            odds_over=p.odds_over,
            odds_under=p.odds_under,
            home_away=home_away,
            player_name=p.player_name,
        )

        # Apply news signals
        matched = signals_for_lean(
            signals,
            player_name=p.player_name,
            team=p.team_abbr,
            game_id=game_id,
        )
        news_action = aggregate_model_action(matched)

        # Phase 7B-1: news signals can downgrade confidence but we don't
        # rewrite the projection yet (that's Phase 7B-2). Signals show in UI.
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

        # Composite source reliability (simple weighted avg)
        # Schedule reliability + odds reliability + max news reliability
        sched_rel = 0.95 if not sched_is_demo else 0.5
        odds_rel = 0.95 if (props_available and not odds_is_demo) else 0.5
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
            # Phase 7B-1 additions
            "gameId": game_id,
            "newsSignals": signals_to_json(matched),
            "newsAction": news_action,
            "riskFlags": risk_flags,
            "sourceReliability": source_rel,
        })

        # Validation log entry
        log_entries.append(LeanLogEntry(
            leanId=lean_id,
            generatedAt=now_iso(),
            date=target_date,
            gameId=game_id,
            playerId=pid if pid else None,
            playerName=p.player_name,
            team=p.team_abbr,
            opponent=opponent_abbr,
            market=p.market,
            line=p.line,
            oddsOver=p.odds_over,
            oddsUnder=p.odds_under,
            bookmaker=p.bookmaker,
            oddsSource=odds_source,
            statsSource=schedule_source,
            modelProjection=scored.projection,
            modelProbability=scored.model_probability,
            impliedProbability=scored.implied_probability,
            edgePct=scored.edge_pct,
            confidence=confidence_final,
            sourceReliabilityScore=source_rel,
            newsSignalIds=[s.id for s in matched],
            riskFlags=risk_flags,
        ))

    log.info(f"  scored {len(leans_payload)} leans")

    # ------------------------------------------------------------------
    # 5. Build payloads
    # ------------------------------------------------------------------
    high_conf = sum(1 for l in leans_payload if l["confidence"] == "High")

    board = {
        "generatedFor": target_date,
        "generatedAt": now_iso(),
        "dataSources": [schedule_source, odds_source],
        "isDemo": sched_is_demo and odds_is_demo,
        "leans": leans_payload,
        # Phase 7B-1 additions
        "scheduleAvailable": schedule_available or sched_is_demo,
        "propsAvailable": props_available,
        "scheduleSource": schedule_source,
        "oddsSource": odds_source if odds_source != "unavailable" else None,
        "games": games_payload,
    }

    # If we have NO games and NO props, mark the day unavailable
    is_available = (len(games_payload) > 0) or (len(leans_payload) > 0)

    slate_day = {
        "date": target_date,
        "dayLabel": day_label(target_date, today),
        "isAvailable": is_available,
        "gameCount": len(games_payload),
        "leanCount": len(leans_payload),
        "highConfidenceCount": high_conf,
        "propsAvailable": props_available,
        "isPrimary": is_primary,
        "scheduleSource": schedule_source,
        "oddsSource": odds_source if odds_source != "unavailable" else None,
        "isDemo": sched_is_demo and odds_is_demo,
    }

    return {
        "board": board,
        "slate_day": slate_day,
        "log_entries": log_entries,
        "trends_for_player": trends_for_player,
        "player_meta": player_meta,
        "schedule_source": schedule_source,
        "odds_source": odds_source,
        "schedule_is_demo": sched_is_demo,
        "odds_is_demo": odds_is_demo,
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> int:
    parser = argparse.ArgumentParser(description="Generate the multi-day model board")
    parser.add_argument("--date", default=None, help="Start date YYYY-MM-DD (default: today)")
    parser.add_argument("--days", type=int, default=None, help="Slate days (default from SLATE_DAYS env)")
    parser.add_argument("--out", default=None, help="Output dir (default: app/public/data)")
    args = parser.parse_args()

    today = args.date or today_in_tz()
    n_days = args.days or C.SLATE_DAYS
    out_dir = Path(args.out) if args.out else C.DATA_OUT
    out_dir.mkdir(parents=True, exist_ok=True)
    boards_dir = out_dir / "boards"
    boards_dir.mkdir(parents=True, exist_ok=True)

    log.info(f"=== Slate: {today} + {n_days - 1} days ===")
    log.info(f"Output dir: {out_dir}")

    # ------------------------------------------------------------------
    # Load manual overrides once (used for every date)
    # ------------------------------------------------------------------
    signals = load_signals()
    log.info(f"manual overrides: {len(signals)} active signals")

    # ------------------------------------------------------------------
    # Generate per-date
    # ------------------------------------------------------------------
    dates = slate_dates(today, n_days)
    per_date_results: list[dict] = []
    all_log_entries: list[LeanLogEntry] = []

    # Honesty rule: in pure demo mode, future dates get "not generated"
    # treatment so we don't show identical demo data for 4 different dates.
    force_demo = (C.NBA_DATA_MODE == "demo" and C.ODDS_DATA_MODE == "demo")

    for date in dates:
        is_primary = (date == today)

        if force_demo and not is_primary:
            # Render an unavailable placeholder for future demo dates
            slate_day = {
                "date": date,
                "dayLabel": day_label(date, today),
                "isAvailable": False,
                "gameCount": 0,
                "leanCount": 0,
                "highConfidenceCount": 0,
                "propsAvailable": False,
                "isPrimary": False,
                "scheduleSource": "unavailable",
                "oddsSource": None,
                "isDemo": True,
            }
            board = {
                "generatedFor": date,
                "generatedAt": now_iso(),
                "dataSources": [],
                "isDemo": True,
                "leans": [],
                "scheduleAvailable": False,
                "propsAvailable": False,
                "scheduleSource": "unavailable",
                "oddsSource": None,
                "games": [],
            }
            per_date_results.append({
                "board": board,
                "slate_day": slate_day,
                "log_entries": [],
                "trends_for_player": {},
                "player_meta": {},
                "schedule_source": "unavailable",
                "odds_source": "unavailable",
                "schedule_is_demo": True,
                "odds_is_demo": True,
            })
            _write_json(boards_dir / f"{date}.json", board)
            log.info(f"  {date}: demo-mode future date — marked unavailable")
            continue

        result = generate_for_date(
            date,
            today=today,
            signals=signals,
            is_primary=is_primary,
        )
        per_date_results.append(result)
        all_log_entries.extend(result["log_entries"])

        # Write per-date board file
        _write_json(boards_dir / f"{date}.json", result["board"])

    # ------------------------------------------------------------------
    # Build slate.json
    # ------------------------------------------------------------------
    slate_payload = {
        "generatedAt": now_iso(),
        "primaryDate": today,
        "slateDays": n_days,
        "days": [r["slate_day"] for r in per_date_results],
        "newsSignalsActive": len(signals),
        "newsSignalsConfigured": _has_signals_file(),
    }
    _write_json(out_dir / "slate.json", slate_payload)

    # ------------------------------------------------------------------
    # Today's data — board.json (back-compat), schedule.json, players.json,
    # trends.json, odds_props.json — all use the primary date
    # ------------------------------------------------------------------
    today_result = next(r for r in per_date_results if r["slate_day"]["isPrimary"])
    today_board = today_result["board"]

    # board.json = today's board (back-compat with existing components)
    _write_json(out_dir / "board.json", today_board)

    # schedule.json = today's games
    schedule_file = {
        "generatedAt": now_iso(),
        "source": today_result["schedule_source"],
        "isDemo": today_result["schedule_is_demo"],
        "date": today,
        "games": today_board["games"],
    }
    _write_json(out_dir / "schedule.json", schedule_file)

    # odds_props.json — leave as-is (now possibly empty)
    odds_payload = []  # we don't keep raw odds in the board payload
    odds_props_file = {
        "generatedAt": now_iso(),
        "source": today_result["odds_source"],
        "isDemo": today_result["odds_is_demo"],
        "date": today,
        "props": odds_payload,
    }
    _write_json(out_dir / "odds_props.json", odds_props_file)

    # players.json (today's player meta)
    players_file = {
        "generatedAt": now_iso(),
        "isDemo": today_result["schedule_is_demo"],
        "players": list(today_result["player_meta"].values()),
    }
    _write_json(out_dir / "players.json", players_file)

    # trends.json (today's trends — only renders when we actually have leans)
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
    # If we don't have any trends from today's run (e.g. no props in 7B-1),
    # preserve the existing trends.json so /trends doesn't go blank.
    if not trends["players"]:
        existing = out_dir / "trends.json"
        if existing.exists():
            log.info("  trends.json preserved (no fresh trends this run)")
        else:
            _write_json(out_dir / "trends.json", trends)
    else:
        _write_json(out_dir / "trends.json", trends)

    # ------------------------------------------------------------------
    # meta.json — overall pipeline status
    # ------------------------------------------------------------------
    overall_data_mode = _compute_overall_mode(per_date_results)
    meta = {
        "appName": "GametimePicks",
        "version": "0.4.0",
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
            {"name": "The Odds API", "description": "Compliant sportsbook odds.", "url": "https://the-odds-api.com/"},
            {"name": "manual overrides", "description": "Human-confirmed news signals.", "url": ""},
        ],
        # Phase 7B-1 additions
        "slateDays": n_days,
        "primaryDate": today,
        "newsSignalsConfigured": _has_signals_file(),
        "newsSignalsActive": len(signals),
    }
    _write_json(out_dir / "meta.json", meta)

    # ------------------------------------------------------------------
    # hit_rates.json — preserve existing or seed from demo
    # ------------------------------------------------------------------
    hr_target = out_dir / "hit_rates.json"
    if not hr_target.exists():
        demo_hr = C.DEMO_DATA_DIR / "hit_rates.json"
        if demo_hr.exists():
            hr_target.write_text(demo_hr.read_text())

    # ------------------------------------------------------------------
    # Validation log — append each lean
    # ------------------------------------------------------------------
    if all_log_entries:
        append_entries(all_log_entries)
    else:
        log.info("validation log: no leans to log this run")

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------
    total_games = sum(r["slate_day"]["gameCount"] for r in per_date_results)
    total_leans = sum(r["slate_day"]["leanCount"] for r in per_date_results)
    log.info(
        f"=== Done. Mode: {overall_data_mode}. "
        f"{len(dates)} days, {total_games} games, {total_leans} leans, "
        f"{len(signals)} active signals ==="
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


def _has_signals_file() -> bool:
    from .manual_overrides import DEFAULT_PATH
    return DEFAULT_PATH.exists()


def _compute_overall_mode(results: list[dict]) -> str:
    """Pick a single mode label for the slate as a whole.

    All demo → "Demo"
    Any live → "Live"
    Mixed   → "Hybrid"
    """
    demos = sum(1 for r in results if r["slate_day"]["isDemo"])
    if demos == len(results):
        return "Demo"
    if demos == 0:
        return "Live"
    return "Hybrid"


def _write_json(path: Path, payload: dict | list) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2))
    log.info(f"  wrote {path.name} ({len(json.dumps(payload))} bytes)")


if __name__ == "__main__":
    raise SystemExit(main())
