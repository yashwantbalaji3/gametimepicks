"""
Generate today's model board.

This is the main pipeline orchestrator. It:

  1. Determines the target date (default = today in TIMEZONE).
  2. Fetches the schedule via the NBA provider chain.
  3. Fetches prop lines via the odds provider chain.
  4. For each prop:
       - looks up the player's recent game logs
       - builds features
       - scores the prop (projection, edge, lean, confidence)
  5. Writes:
       - app/public/data/board.json
       - app/public/data/schedule.json
       - app/public/data/players.json
       - app/public/data/odds_props.json
       - app/public/data/trends.json
       - app/public/data/meta.json

Designed to fail gracefully end-to-end — if every NBA provider is down, we
still write a board.json with the demo data, mark the run as demo mode, and
the frontend renders identically.
"""
from __future__ import annotations

import argparse
import json
import logging
from datetime import datetime, timezone
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


def format_tipoff(game) -> str:
    """Use whatever the provider gave us. NBA.com formats tipoffs in their
    own style; demo provider gives a clean "7:30 PM ET" already."""
    return game.tipoff_et or "TBD"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> int:
    parser = argparse.ArgumentParser(description="Generate today's model board")
    parser.add_argument("--date", default=None, help="YYYY-MM-DD (default: today)")
    parser.add_argument("--out", default=None, help="Output dir (default: app/public/data)")
    args = parser.parse_args()

    target_date = args.date or today_in_tz()
    out_dir = Path(args.out) if args.out else C.DATA_OUT
    out_dir.mkdir(parents=True, exist_ok=True)

    log.info(f"=== Generating board for {target_date} ===")
    log.info(f"Output dir: {out_dir}")

    # ------------------------------------------------------------------
    # 1. Schedule
    # ------------------------------------------------------------------
    games, schedule_source = fetch_schedule(target_date)
    log.info(f"Schedule: {len(games)} games via {schedule_source}")

    # Map team_abbr → game info (for tipoff and home/away)
    game_for_team: dict[str, tuple[str, str, str]] = {}  # abbr → (tipoff, home_away, opponent)
    games_payload = []
    for g in games:
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
        game_for_team[g.home_team_abbr] = (format_tipoff(g), "Home", g.away_team_abbr)
        game_for_team[g.away_team_abbr] = (format_tipoff(g), "Away", g.home_team_abbr)

    # ------------------------------------------------------------------
    # 2. Odds / props
    # ------------------------------------------------------------------
    props, odds_source = fetch_props(target_date, markets=list(C.MARKETS))
    log.info(f"Props: {len(props)} prop lines via {odds_source}")

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
    # 3. For each unique player on the props list, fetch game logs +
    #    build features. We do this once per player (not per prop) to
    #    minimize provider hits.
    # ------------------------------------------------------------------
    unique_players: dict[int, str] = {}
    for p in props:
        if p.player_id and p.player_id not in unique_players:
            unique_players[p.player_id] = p.player_name

    # If no real props (demo path with player_id=0), fall back to scoring
    # every demo player from trends.json
    if not unique_players:
        # Try demo path: pull players from the demo trends file via the chain
        for p in props:
            if p.player_name and p.player_id == 0:
                # Demo data uses real player IDs, but odds API path leaves
                # player_id=0. Hydrate from trends.json by name match.
                trends_path = C.DEMO_DATA_DIR / "trends.json"
                if trends_path.exists():
                    tdata = json.loads(trends_path.read_text())
                    for tp in tdata.get("players", []):
                        if tp["playerName"] == p.player_name:
                            unique_players[int(tp["playerId"])] = p.player_name
                            break

    log.info(f"Unique players to fetch: {len(unique_players)}")

    features_for_player: dict[int, dict] = {}
    trends_for_player: dict[int, dict] = {}
    player_meta: dict[int, dict] = {}   # for players.json

    for pid, pname in unique_players.items():
        logs, src = fetch_player_game_logs(pid, last_n=C.GAME_LOG_WINDOW)
        if not logs:
            continue
        features_for_player[pid] = build_player_features(logs)
        trends_for_player[pid] = build_trend_payload(logs)
        player_meta[pid] = {
            "playerId": pid,
            "playerName": pname,
            "team": logs[0].opponent_abbr if False else "",  # filled below
        }

    # Attach team via odds-side info (we know team_abbr for each prop)
    name_to_team: dict[str, str] = {}
    for p in props:
        if p.player_name and p.team_abbr:
            name_to_team.setdefault(p.player_name, p.team_abbr)

    for pid, meta in player_meta.items():
        meta["team"] = name_to_team.get(meta["playerName"], "")

    # ------------------------------------------------------------------
    # 4. Score every prop
    # ------------------------------------------------------------------
    leans_payload = []
    for p in props:
        # Map player_id (may be 0 from odds API) to a usable id we have features for
        pid = p.player_id
        if pid == 0 or pid not in features_for_player:
            # Try by name match against unique_players we hydrated
            for known_pid, known_name in unique_players.items():
                if known_name == p.player_name:
                    pid = known_pid
                    break

        feats = features_for_player.get(pid)
        if not feats:
            log.warning(f"No features for {p.player_name} ({p.market}) — skipping")
            continue

        # Look up tipoff + home/away from schedule
        tipoff, home_away, opponent_abbr = game_for_team.get(
            p.team_abbr, ("TBD", "Home", "")
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

        leans_payload.append({
            "id": f"{target_date}-{pid}-{p.market}",
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
            "confidence": scored.confidence,
            "reason": scored.reason,
            "status": "Pending",
        })

    log.info(f"Scored {len(leans_payload)} leans")

    # ------------------------------------------------------------------
    # 5. Determine data mode
    # ------------------------------------------------------------------
    sched_is_demo = schedule_source == "demo"
    odds_is_demo = odds_source == "demo"
    if sched_is_demo and odds_is_demo:
        data_mode = "Demo"
    elif sched_is_demo or odds_is_demo:
        data_mode = "Hybrid"
    else:
        data_mode = "Live"

    # ------------------------------------------------------------------
    # 6. Write outputs
    # ------------------------------------------------------------------
    board = {
        "generatedFor": target_date,
        "generatedAt": now_iso(),
        "dataSources": [schedule_source, odds_source],
        "isDemo": sched_is_demo and odds_is_demo,
        "leans": leans_payload,
    }
    _write_json(out_dir / "board.json", board)

    schedule_file = {
        "generatedAt": now_iso(),
        "source": schedule_source,
        "isDemo": sched_is_demo,
        "date": target_date,
        "games": games_payload,
    }
    _write_json(out_dir / "schedule.json", schedule_file)

    odds_props_file = {
        "generatedAt": now_iso(),
        "source": odds_source,
        "isDemo": odds_is_demo,
        "date": target_date,
        "props": odds_payload,
    }
    _write_json(out_dir / "odds_props.json", odds_props_file)

    players_file = {
        "generatedAt": now_iso(),
        "isDemo": sched_is_demo,
        "players": list(player_meta.values()),
    }
    _write_json(out_dir / "players.json", players_file)

    trends = {
        "generatedAt": now_iso(),
        "isDemo": sched_is_demo,
        "players": [
            {
                "playerId": pid,
                "playerName": player_meta.get(pid, {}).get("playerName", ""),
                "team": player_meta.get(pid, {}).get("team", ""),
                "position": "",
                **trends_for_player[pid],
            }
            for pid in trends_for_player
        ],
    }
    _write_json(out_dir / "trends.json", trends)

    # Meta — provider statuses + active chain + data mode
    meta = {
        "appName": "GametimePicks",
        "version": "0.3.0",
        "lastPipelineRun": now_iso(),
        "isDemo": sched_is_demo and odds_is_demo,
        "dataMode": data_mode,
        "nbaScheduleSource": schedule_source,
        "nbaStatsSource": schedule_source,    # same chain
        "oddsSource": odds_source,
        "activeProvider": {
            "nba": schedule_source,
            "odds": odds_source,
        },
        "providerStatuses": [s.to_dict() for s in all_provider_statuses()],
        "fallbackSourcesAvailable": _fallback_summary(),
        "lastSuccessfulFetch": now_iso(),
        "dataSources": [
            {"name": "demo data", "description": "Bundled offline fallback.", "url": ""},
            {"name": "nba_api", "description": "Official NBA Stats endpoints.", "url": "https://github.com/swar/nba_api"},
            {"name": "The Odds API", "description": "Compliant sportsbook odds.", "url": "https://the-odds-api.com/"},
        ],
    }
    _write_json(out_dir / "meta.json", meta)

    # If we don't have hit_rates yet, copy the demo file so the Results page
    # always has data. settle_results.py overwrites this once games settle.
    hr_target = out_dir / "hit_rates.json"
    if not hr_target.exists():
        demo_hr = C.DEMO_DATA_DIR / "hit_rates.json"
        if demo_hr.exists():
            hr_target.write_text(demo_hr.read_text())

    log.info(f"=== Done. Mode: {data_mode}. Wrote 6 JSON files to {out_dir} ===")
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
    """Renders the fallback toggles that show up in the UI badge."""
    return {
        "espn": "enabled" if C.ENABLE_ESPN_FALLBACK else "disabled",
        "balldontlie": "enabled" if C.ENABLE_BALLDONTLIE_FALLBACK else "disabled",
        "opticodds": "enabled" if C.ENABLE_OPTICODDS else "disabled",
        "sportsdata": "enabled" if C.ENABLE_SPORTSDATA else "disabled",
    }


def _write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2))
    log.info(f"  wrote {path.name} ({len(json.dumps(payload))} bytes)")


if __name__ == "__main__":
    raise SystemExit(main())
