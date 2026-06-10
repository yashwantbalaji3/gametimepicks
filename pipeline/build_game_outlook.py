"""
build_game_outlook — derive a MARKET-IMPLIED game outlook from real h2h/spread/total
odds (written by fetch_game_markets). PURE transform of sportsbook prices — NOT a model
pick: implied win probability is de-vigged from the moneyline; team totals are derived
from the posted total + spread. No projections, no leakage (pre-game market data only).

Reads:  app/public/data/{sport}/game-markets/<date>.json
Writes: app/public/data/game-outlook/{sport}/<date>.json (+ latest alias)
Run:    python -m pipeline.build_game_outlook --date 2026-06-10 --sport nba
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from .score_model import american_to_probability, devig_two_way

REPO = Path(__file__).resolve().parents[1]
DATA = REPO / "app" / "public" / "data"


def _round(x, n=1):
    return round(x, n) if isinstance(x, (int, float)) else None


def derive_game(g: dict) -> dict:
    ml = g.get("moneyline") or {}
    spread = g.get("spread") or {}
    total = g.get("total") or {}
    missing = []
    home_ml, away_ml = ml.get("home"), ml.get("away")
    win_home = win_away = None
    if isinstance(home_ml, (int, float)) and isinstance(away_ml, (int, float)):
        ph, pa = devig_two_way(american_to_probability(home_ml), american_to_probability(away_ml))
        win_home, win_away = round(ph, 4), round(pa, 4)
    else:
        missing.append("moneyline")
    line = total.get("line")
    over, under = total.get("over"), total.get("under")
    # Honest data-quality guard: a TRUE main total has balanced juice (~ -110/-110).
    # When both sides are far from even (max raw implied prob > 0.70) the line is an
    # alternate / stale opener, NOT the consensus main total — drop it rather than
    # display a misleading number. We do NOT invent a replacement; we flag it missing.
    suspect_total = (
        isinstance(over, (int, float)) and isinstance(under, (int, float))
        and max(american_to_probability(over), american_to_probability(under)) > 0.70
    )
    sp_home = spread.get("home")
    valid_total = isinstance(line, (int, float)) and not suspect_total
    team_home = team_away = None
    if valid_total and isinstance(sp_home, (int, float)):
        # total = home + away ; home - away = -spread.home
        team_home = _round((line - sp_home) / 2.0)
        team_away = _round((line + sp_home) / 2.0)
    if not valid_total:
        line = None
        missing.append("total_suspect_juice" if suspect_total else "total")
    if not isinstance(sp_home, (int, float)):
        missing.append("spread")
    return {
        "gameId": g.get("gameId"),
        "homeTeam": g.get("homeTeam"), "awayTeam": g.get("awayTeam"),
        "startTime": g.get("commenceTime") or g.get("startTime") or g.get("tipoff"),
        "moneyline": ml or None,
        "impliedWinProbHome": win_home, "impliedWinProbAway": win_away,
        "spread": spread or None,
        "total": line,
        "teamTotalHome": team_home, "teamTotalAway": team_away,
        "bookmaker": g.get("bookmaker"),
        "lastUpdate": g.get("lastUpdate"),
        # hasMarket drives the UI: true when there's a real win prob OR a trustworthy
        # total. A game with only a stale alternate / no main markets renders the
        # friendly "market not posted yet" state instead of a misleading partial card.
        "hasMarket": (win_home is not None) or (line is not None),
        "missing": missing,
    }


def build(sport: str, date: str, now: datetime | None = None) -> dict:
    ref = now or datetime.now(timezone.utc)
    src = DATA / sport / "game-markets" / f"{date}.json"
    gm = {}
    try:
        gm = json.loads(src.read_text())
    except Exception:
        pass
    games_in = gm.get("games") or {}
    games = [derive_game(g) for g in (games_in.values() if isinstance(games_in, dict) else games_in)]
    return {
        "generatedAt": ref.isoformat(timespec="seconds"),
        "sport": sport, "date": date,
        "kind": "market_outlook",
        "disclaimer": "Market outlook — implied by current sportsbook prices. Not a model pick.",
        "source": "the_odds_api", "bookmakersPreferred": gm.get("bookmakers"),
        "oddsGeneratedAt": gm.get("generatedAt"),
        "gameCount": len(games), "games": games,
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", required=True)
    ap.add_argument("--sport", default="nba", choices=["nba", "mlb"])
    args = ap.parse_args(argv)
    payload = build(args.sport, args.date)
    out_dir = DATA / "game-outlook" / args.sport
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / f"{args.date}.json").write_text(json.dumps(payload, indent=2) + "\n")
    (out_dir / "latest.json").write_text(json.dumps(payload, indent=2) + "\n")
    print(f"wrote game-outlook {args.sport} {args.date}: {payload['gameCount']} games")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
