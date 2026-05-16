"""MLB main-board pipeline.

Orchestrates: schedule (free) → odds (paid, capped) → projections (free).
Writes:
  app/public/data/mlb/schedule/<date>.json
  app/public/data/mlb/boards/<date>.json
  app/public/data/mlb/power/<date>.json   (pending shell; populated by
                                            generate_mlb_power if desired)

Usage:
    python3 -m pipeline.mlb.generate_mlb_board --date 2026-05-16
    python3 -m pipeline.mlb.generate_mlb_board --date 2026-05-16 --dry-run
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from .. import config as C
from . import mlb_odds, mlb_stats, mlb_model

SEASON = 2026
DEFAULT_DATE = "2026-05-16"

PITCHER_MARKETS = ("pitcher_strikeouts",)
BATTER_MARKETS = (
    "batter_hits",
    "batter_total_bases",
    "batter_hits_runs_rbis",
)


def _out_dir(kind: str) -> Path:
    p = C.APP_PUBLIC_DATA / "mlb" / kind
    p.mkdir(parents=True, exist_ok=True)
    return p


def _team_lookup_from_schedule(games: list[dict]) -> dict[str, dict]:
    """Index team-name → {abbr, id, opponent_abbr, home_or_away, gamePk}.

    The Odds API uses full team names ("Toronto Blue Jays"); MLB-StatsAPI
    uses both names and abbreviations. We build a name-keyed lookup so we
    can attach team context onto each prop row.
    """
    lookup: dict[str, dict] = {}
    for g in games:
        home = {
            "name": g.get("homeTeamName"),
            "abbr": g.get("homeTeamAbbr"),
            "id": g.get("homeTeamId"),
            "homeOrAway": "Home",
            "opponentAbbr": g.get("awayTeamAbbr"),
            "opponentName": g.get("awayTeamName"),
            "gamePk": g.get("gamePk"),
            "gameDate": g.get("gameDate"),
            "venue": g.get("venue"),
        }
        away = {
            "name": g.get("awayTeamName"),
            "abbr": g.get("awayTeamAbbr"),
            "id": g.get("awayTeamId"),
            "homeOrAway": "Away",
            "opponentAbbr": g.get("homeTeamAbbr"),
            "opponentName": g.get("homeTeamName"),
            "gamePk": g.get("gamePk"),
            "gameDate": g.get("gameDate"),
            "venue": g.get("venue"),
        }
        if home["name"]:
            lookup[home["name"]] = home
        if away["name"]:
            lookup[away["name"]] = away
    return lookup


def _build_lean(
    row: dict,
    team_ctx: dict[str, dict],
    projection: dict,
    is_pitcher: bool,
) -> dict:
    """Combine an odds row + a projection result into the final lean record."""
    grade = mlb_model.grade(
        projection.get("projection"),
        row["line"],
        projection.get("sigma", 0.0),
        row["impliedOver"],
        row["impliedUnder"],
    )
    # Match player → team via "any of player_name in roster" is overkill for
    # MVP. We approximate using the home/away teams on the event: the player
    # will appear in one of them. The Odds API does not tag this, so we mark
    # the team field as "unknown" when we can't resolve it. UI will show the
    # matchup string regardless.
    home_ctx = team_ctx.get(row.get("homeTeam") or "") or {}
    away_ctx = team_ctx.get(row.get("awayTeam") or "") or {}
    market_key = row["marketKey"]

    reason_bits: list[str] = []
    if projection.get("insufficient"):
        reason_bits.append("sample too small to project")
    else:
        if is_pitcher:
            reason_bits.append(
                f"last 3 {projection['last3Mean']:.1f} K · season {projection['seasonMean']:.1f} K · {projection['samples']} starts"
            )
        else:
            reason_bits.append(
                f"last 10 {projection['last10Mean']:.2f} · season {projection['seasonMean']:.2f} · {projection['samples']} games"
            )
    if grade.get("riskFlags") and "r5_model_anomaly" in grade["riskFlags"]:
        reason_bits.append("flagged: edge above R5 anomaly threshold")

    return {
        "id": f"{row['gameId']}-{row['playerName'].replace(' ', '_')}-{market_key}",
        "sport": "MLB",
        "date": row["commenceTime"][:10],
        "gameId": row["gameId"],
        "gamePk": (home_ctx.get("gamePk") or away_ctx.get("gamePk")),
        "commenceTime": row["commenceTime"],
        "homeTeamAbbr": home_ctx.get("abbr"),
        "homeTeamName": row.get("homeTeam"),
        "awayTeamAbbr": away_ctx.get("abbr"),
        "awayTeamName": row.get("awayTeam"),
        "venue": home_ctx.get("venue"),
        "playerName": row["playerName"],
        "playerRole": "pitcher" if is_pitcher else "batter",
        "marketKey": market_key,
        "marketLabel": _market_label(market_key),
        "line": row["line"],
        "oddsOver": row["oddsOver"],
        "oddsUnder": row["oddsUnder"],
        "impliedOver": round(row["impliedOver"], 4),
        "impliedUnder": round(row["impliedUnder"], 4),
        "bookmaker": row["bookmaker"],
        "projection": projection.get("projection"),
        "sigma": projection.get("sigma") or None,
        "samples": projection.get("samples", 0),
        "recentSeries": projection.get("recentSeries", []),
        "lean": grade["lean"],
        "confidence": grade["confidence"],
        "modelProbOver": grade["modelProbOver"],
        "modelProbUnder": grade["modelProbUnder"],
        "edgePct": grade["edgePct"],
        "edgePctOver": grade["edgePctOver"],
        "edgePctUnder": grade["edgePctUnder"],
        "riskFlags": grade["riskFlags"],
        "reason": " · ".join(reason_bits),
    }


def _market_label(key: str) -> str:
    return {
        "pitcher_strikeouts": "Strikeouts",
        "batter_hits": "Hits",
        "batter_total_bases": "Total Bases",
        "batter_hits_runs_rbis": "Hits + Runs + RBIs",
    }.get(key, key)


def run(
    date: str,
    *,
    dry_run: bool = False,
    markets: list[str] | None = None,
    regions: list[str] | None = None,
    bookmakers: list[str] | None = None,
    min_credits_remaining: int = 350,
    max_credits_per_run: int = 75,
) -> dict:
    """Run the full pipeline. Returns a summary dict."""
    markets = markets or mlb_odds.DEFAULT_MARKETS
    regions = regions or mlb_odds.DEFAULT_REGIONS
    bookmakers = bookmakers or mlb_odds.DEFAULT_BOOKMAKERS

    summary: dict = {
        "date": date,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "dryRun": dry_run,
        "markets": markets,
        "regions": regions,
        "bookmakers": bookmakers,
        "creditsBefore": None,
        "creditsAfter": None,
        "creditsSpent": 0,
        "eventsScheduled": 0,
        "eventsWithOdds": 0,
        "propRowsFetched": 0,
        "leansEmitted": 0,
        "insufficientCount": 0,
        "warnings": [],
    }

    # ------------------------------------------------------------------
    # 1) Schedule (FREE)
    # ------------------------------------------------------------------
    raw_games = mlb_stats.fetch_schedule(date)
    games = mlb_stats.normalize_schedule_games(date, raw_games)
    summary["eventsScheduled"] = len(games)

    schedule_payload = {
        "sport": "MLB",
        "date": date,
        "generatedAt": summary["generatedAt"],
        "source": "mlb-statsapi.fetch_schedule",
        "games": games,
    }
    schedule_path = _out_dir("schedule") / f"{date}.json"
    schedule_path.write_text(json.dumps(schedule_payload, indent=2))
    print(f"[schedule] wrote {schedule_path.relative_to(C.ROOT_DIR)} — {len(games)} games")

    team_ctx = _team_lookup_from_schedule(games)

    # ------------------------------------------------------------------
    # 2) Odds events (FREE) + cost gate
    # ------------------------------------------------------------------
    if not C.ODDS_API_KEY:
        summary["warnings"].append("ODDS_API_KEY not configured — props pending state")
        _write_pending_board(date, games, summary, reason="odds_not_configured")
        return summary

    events, headers = mlb_odds.list_events_for_date(date)
    summary["creditsBefore"] = headers.get("x-requests-remaining")
    print(f"[odds] events on {date}: {len(events)} · remaining: {summary['creditsBefore']}")

    if not events:
        summary["warnings"].append("Odds API returned 0 MLB events for date")
        _write_pending_board(date, games, summary, reason="no_events")
        return summary

    estimated_cost = len(events) * len(markets) * len(regions)
    summary["estimatedCost"] = estimated_cost
    try:
        rem = int(summary["creditsBefore"]) if summary["creditsBefore"] else 0
    except (TypeError, ValueError):
        rem = 0
    after = rem - estimated_cost

    print(f"[odds] estimated cost: {estimated_cost} credits · projected after: {after}")
    if estimated_cost > max_credits_per_run:
        summary["warnings"].append(
            f"estimated cost {estimated_cost} > cap {max_credits_per_run}; skipping paid fetch"
        )
        _write_pending_board(date, games, summary, reason="cost_cap")
        return summary
    if after < min_credits_remaining:
        summary["warnings"].append(
            f"projected remaining {after} < floor {min_credits_remaining}; skipping paid fetch"
        )
        _write_pending_board(date, games, summary, reason="floor_guard")
        return summary

    if dry_run:
        print("[odds] DRY RUN — skipping paid /odds calls")
        _write_pending_board(date, games, summary, reason="dry_run")
        return summary

    # ------------------------------------------------------------------
    # 3) Odds fetch (PAID) per event
    # ------------------------------------------------------------------
    all_rows: list[dict] = []
    for i, e in enumerate(events, 1):
        eid = e.get("id")
        try:
            payload, hdrs = mlb_odds.fetch_event_odds(eid, list(markets), list(regions), list(bookmakers))
            summary["creditsAfter"] = hdrs.get("x-requests-remaining")
            last_cost = hdrs.get("x-requests-last")
            try:
                if last_cost is not None:
                    summary["creditsSpent"] += int(last_cost)
            except (TypeError, ValueError):
                pass
            rows = mlb_odds.parse_event_odds(payload, list(bookmakers))
            all_rows.extend(rows)
            if rows:
                summary["eventsWithOdds"] += 1
            print(
                f"[odds {i:02d}/{len(events)}] {e.get('away_team')} @ {e.get('home_team')} "
                f"— {len(rows)} rows · last_cost={last_cost} · rem={summary['creditsAfter']}"
            )
        except mlb_odds.MlbOddsError as err:
            summary["warnings"].append(f"event {eid}: {err}")
            print(f"[odds {i:02d}/{len(events)}] FAILED: {err}")
        time.sleep(0.15)

    summary["propRowsFetched"] = len(all_rows)

    # ------------------------------------------------------------------
    # 4) Game logs (FREE) — only for players who appear in prop rows
    # ------------------------------------------------------------------
    pitcher_id_by_name: dict[str, int] = {}
    for g in games:
        if g.get("awayProbablePitcherName") and g.get("awayProbablePitcherId"):
            pitcher_id_by_name[g["awayProbablePitcherName"]] = g["awayProbablePitcherId"]
        if g.get("homeProbablePitcherName") and g.get("homeProbablePitcherId"):
            pitcher_id_by_name[g["homeProbablePitcherName"]] = g["homeProbablePitcherId"]

    # Batter IDs: resolve from rosters of teams playing today
    # (Odds API only gives us player names; MLB API gives us names + ids per roster).
    print(f"[stats] fetching rosters for {len(team_ctx)} teams")
    batter_id_by_name: dict[str, int] = {}
    for team_name, ctx in team_ctx.items():
        team_id = ctx.get("id")
        if not team_id:
            continue
        try:
            roster = mlb_stats.fetch_team_roster(int(team_id))
        except mlb_stats.MlbStatsError as err:
            summary["warnings"].append(f"roster fetch failed for {team_name}: {err}")
            continue
        for entry in roster:
            person = entry.get("person", {}) or {}
            pos = (entry.get("position", {}) or {}).get("type") or ""
            if pos == "Pitcher":
                # still index in case pitcher is referenced in batter logs (rare)
                pitcher_id_by_name.setdefault(person.get("fullName"), person.get("id"))
            else:
                if person.get("fullName"):
                    batter_id_by_name[person["fullName"]] = person.get("id")
        time.sleep(0.05)

    pitcher_names_in_props = {r["playerName"] for r in all_rows if r["marketKey"] in PITCHER_MARKETS}
    batter_names_in_props = {r["playerName"] for r in all_rows if r["marketKey"] in BATTER_MARKETS}

    pitcher_ids_to_fetch = {pitcher_id_by_name[n] for n in pitcher_names_in_props if n in pitcher_id_by_name}
    batter_ids_to_fetch = {batter_id_by_name[n] for n in batter_names_in_props if n in batter_id_by_name}
    print(
        f"[stats] pitchers in props: {len(pitcher_names_in_props)} resolved → {len(pitcher_ids_to_fetch)}"
    )
    print(
        f"[stats] batters in props: {len(batter_names_in_props)} resolved → {len(batter_ids_to_fetch)}"
    )

    pitcher_logs = mlb_stats.fetch_player_game_logs_bulk(pitcher_ids_to_fetch, SEASON, "pitching")
    batter_logs = mlb_stats.fetch_player_game_logs_bulk(batter_ids_to_fetch, SEASON, "hitting")

    # ------------------------------------------------------------------
    # 5) Project + grade
    # ------------------------------------------------------------------
    leans: list[dict] = []
    for row in all_rows:
        market = row["marketKey"]
        if market in PITCHER_MARKETS:
            pid = pitcher_id_by_name.get(row["playerName"])
            logs = pitcher_logs.get(pid, []) if pid else []
            proj = mlb_model.project_pitcher_strikeouts(logs)
            is_pitcher = True
        elif market in BATTER_MARKETS:
            pid = batter_id_by_name.get(row["playerName"])
            logs = batter_logs.get(pid, []) if pid else []
            proj = mlb_model.project_batter_market(logs, market)
            is_pitcher = False
        else:
            continue
        lean = _build_lean(row, team_ctx, proj, is_pitcher)
        leans.append(lean)
        if proj.get("insufficient"):
            summary["insufficientCount"] += 1

    summary["leansEmitted"] = len(leans)

    # ------------------------------------------------------------------
    # 6) Aggregate counts and write board
    # ------------------------------------------------------------------
    board_payload = {
        "sport": "MLB",
        "date": date,
        "generatedAt": summary["generatedAt"],
        "generatedFor": date,
        "isDemo": False,
        "scheduleAvailable": bool(games),
        "propsAvailable": bool(all_rows),
        "scheduleSource": "mlb-statsapi",
        "oddsSource": "the_odds_api",
        "dataSources": ["mlb-statsapi", "the_odds_api"],
        "games": games,
        "leans": leans,
        "summary": {
            "scheduledGames": len(games),
            "eventsWithOdds": summary["eventsWithOdds"],
            "leans": len(leans),
            "highConfidence": sum(1 for l in leans if l["confidence"] == "High"),
            "mediumConfidence": sum(1 for l in leans if l["confidence"] == "Medium"),
            "lowConfidence": sum(1 for l in leans if l["confidence"] == "Low"),
            "insufficientData": summary["insufficientCount"],
            "anomalies": sum(
                1 for l in leans if "r5_model_anomaly" in (l.get("riskFlags") or [])
            ),
            "byMarket": _by_market_counts(leans),
        },
        "credits": {
            "before": summary["creditsBefore"],
            "after": summary["creditsAfter"],
            "spent": summary["creditsSpent"],
            "estimated": summary.get("estimatedCost"),
        },
    }

    board_path = _out_dir("boards") / f"{date}.json"
    board_path.write_text(json.dumps(board_payload, indent=2))
    print(f"[board] wrote {board_path.relative_to(C.ROOT_DIR)} — {len(leans)} leans")

    # ------------------------------------------------------------------
    # 7) Power Board shell (pending) — populated separately
    # ------------------------------------------------------------------
    power_payload = {
        "sport": "MLB",
        "scope": "home_runs",
        "date": date,
        "generatedAt": summary["generatedAt"],
        "state": "pending",
        "reason": "HR Power Board uses a separate variance profile and dedicated data inputs that aren't wired yet. Schedule below shows the slate the Power Board will analyze once those inputs are live.",
        "inputsPlanned": [
            "season slugging + hard-hit + barrel rate (Baseball Savant)",
            "pitcher HR-allowed rate + handedness splits",
            "park factor + weather",
            "lineup position",
        ],
        "games": games,
    }
    power_path = _out_dir("power") / f"{date}.json"
    power_path.write_text(json.dumps(power_payload, indent=2))
    print(f"[power] wrote pending shell {power_path.relative_to(C.ROOT_DIR)}")

    return summary


def _by_market_counts(leans: list[dict]) -> dict:
    out: dict = {}
    for l in leans:
        m = l["marketKey"]
        if m not in out:
            out[m] = {"total": 0, "high": 0, "medium": 0, "low": 0, "insufficient": 0}
        out[m]["total"] += 1
        if l["confidence"] == "High":
            out[m]["high"] += 1
        elif l["confidence"] == "Medium":
            out[m]["medium"] += 1
        elif l["confidence"] == "Low":
            out[m]["low"] += 1
        elif l["confidence"] == "insufficient_data":
            out[m]["insufficient"] += 1
    return out


def _write_pending_board(date: str, games: list[dict], summary: dict, *, reason: str) -> None:
    """Write a schedule-only board when props can't be fetched."""
    board_payload = {
        "sport": "MLB",
        "date": date,
        "generatedAt": summary["generatedAt"],
        "generatedFor": date,
        "isDemo": False,
        "scheduleAvailable": bool(games),
        "propsAvailable": False,
        "scheduleSource": "mlb-statsapi",
        "oddsSource": None,
        "dataSources": ["mlb-statsapi"],
        "pendingReason": reason,
        "games": games,
        "leans": [],
        "summary": {
            "scheduledGames": len(games),
            "eventsWithOdds": 0,
            "leans": 0,
            "highConfidence": 0,
            "mediumConfidence": 0,
            "lowConfidence": 0,
            "insufficientData": 0,
            "anomalies": 0,
            "byMarket": {},
        },
        "credits": {
            "before": summary["creditsBefore"],
            "after": summary["creditsAfter"],
            "spent": 0,
            "estimated": summary.get("estimatedCost"),
        },
    }
    board_path = _out_dir("boards") / f"{date}.json"
    board_path.write_text(json.dumps(board_payload, indent=2))
    print(f"[board] wrote pending board {board_path.relative_to(C.ROOT_DIR)} — reason={reason}")

    # Always write the pending Power Board shell too
    power_payload = {
        "sport": "MLB",
        "scope": "home_runs",
        "date": date,
        "generatedAt": summary["generatedAt"],
        "state": "pending",
        "reason": "Power Board data inputs aren't wired yet. The schedule below is what the Power Board will analyze when they're live.",
        "inputsPlanned": [
            "season slugging + hard-hit + barrel rate (Baseball Savant)",
            "pitcher HR-allowed rate + handedness splits",
            "park factor + weather",
            "lineup position",
        ],
        "games": games,
    }
    power_path = _out_dir("power") / f"{date}.json"
    power_path.write_text(json.dumps(power_payload, indent=2))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate the MLB MVP board for a date.")
    parser.add_argument("--date", default=DEFAULT_DATE, help="YYYY-MM-DD (ET)")
    parser.add_argument("--dry-run", action="store_true", help="Skip paid /odds calls")
    parser.add_argument(
        "--markets",
        default=None,
        help="Comma-separated market keys. Defaults to all 4 MVP markets.",
    )
    parser.add_argument(
        "--min-credits-remaining",
        type=int,
        default=350,
        help="Refuse to run if projected remaining < this",
    )
    parser.add_argument(
        "--max-credits-per-run",
        type=int,
        default=75,
        help="Refuse to run if estimated cost exceeds this",
    )
    args = parser.parse_args(argv)

    markets = None
    if args.markets:
        markets = [m.strip() for m in args.markets.split(",") if m.strip()]

    summary = run(
        args.date,
        dry_run=args.dry_run,
        markets=markets,
        min_credits_remaining=args.min_credits_remaining,
        max_credits_per_run=args.max_credits_per_run,
    )
    print("\n=== summary ===")
    print(json.dumps(summary, indent=2, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())
