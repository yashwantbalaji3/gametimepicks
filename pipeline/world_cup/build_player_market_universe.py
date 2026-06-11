"""
Sportsbook player-market universe for today's World Cup matches.

The sportsbook's own player-prop list IS a strong predicted-starter signal: FanDuel/DraftKings
only post props for players they expect to matter. We extract that universe (player + market +
line + best price) from The Odds API per-event endpoint, so pre-lineup player projections can be
built from a REAL candidate set — never invented players. Bounded: one player-market call per
today event. Writes player-markets/latest.json + per-date.
"""
from __future__ import annotations

import argparse, json, os
from datetime import datetime, timezone
from pathlib import Path

from .odds_api import _http_get, API_BASE, load_schedule_for_date
from .team_aliases import pair_key

REPO = Path(__file__).resolve().parents[2]
DATA = REPO / "app" / "public" / "data" / "world-cup"
SPORT = "soccer_fifa_world_cup"
PLAYER_MARKETS = ["player_shots", "player_shots_on_target", "player_assists", "player_goal_scorer_anytime"]


def _norm_player(name: str | None) -> str:
    import unicodedata
    s = unicodedata.normalize("NFKD", name or "").encode("ascii", "ignore").decode()
    return "".join(c for c in s.lower() if c.isalnum())


def _events(api_key: str) -> list[dict]:
    code, data, _ = _http_get(f"{API_BASE}/sports/{SPORT}/events", {"apiKey": api_key})
    return data if (code == 200 and isinstance(data, list)) else []


def _event_player_odds(api_key: str, event_id: str) -> tuple[dict, str | None]:
    code, data, headers = _http_get(
        f"{API_BASE}/sports/{SPORT}/events/{event_id}/odds",
        {"apiKey": api_key, "regions": "us", "markets": ",".join(PLAYER_MARKETS), "oddsFormat": "american"},
    )
    rem = headers.get("x-requests-remaining") if headers else None
    return (data if (code == 200 and isinstance(data, dict)) else {}), rem


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", required=True)
    args = ap.parse_args(argv)
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    api_key = os.environ.get("ODDS_API_KEY")
    if not api_key:
        print("[wc-player-universe] STOP ODDS_API_KEY not set"); return 2

    today = load_schedule_for_date(args.date)
    today_pairs = {pair_key(m.get("home"), m.get("away")) for m in today}
    events = [e for e in _events(api_key) if pair_key(e.get("home_team"), e.get("away_team")) in today_pairs]

    matches, remaining = [], None
    for ev in events[:2]:
        payload, remaining = _event_player_odds(api_key, ev["id"])
        # players keyed by (normName, market) → best price + outcomes
        players: dict = {}
        for bk in payload.get("bookmakers") or []:
            book = bk.get("key")
            for m in bk.get("markets") or []:
                mk = m.get("key")
                if mk not in PLAYER_MARKETS:
                    continue
                for o in m.get("outcomes") or []:
                    # Player name is in `description`; `name` is Over/Under/Yes; `point` is the line.
                    pname = o.get("description") or o.get("participant")
                    if not pname:
                        continue
                    side = (o.get("name") or "").lower()
                    line = o.get("point")
                    price = o.get("price")
                    if price is None:
                        continue
                    key = (_norm_player(pname), mk, side, line)
                    cur = players.get(key)
                    # keep best (highest) price across books
                    if cur is None or price > cur["americanOdds"]:
                        players[key] = {
                            "playerName": pname, "normName": _norm_player(pname), "market": mk,
                            "side": side, "line": line, "americanOdds": price, "bookmaker": book,
                        }
        match_players = list(players.values())
        markets_found = sorted({p["market"] for p in match_players})
        matches.append({
            "oddsEventId": ev["id"], "homeTeam": ev.get("home_team"), "awayTeam": ev.get("away_team"),
            "commenceTime": ev.get("commence_time"),
            "pair": pair_key(ev.get("home_team"), ev.get("away_team")),
            "marketsFound": markets_found, "playerOutcomeCount": len(match_players),
            "distinctPlayers": len({p["normName"] for p in match_players}),
            "players": match_players,
        })

    payload = {
        "generatedAt": now, "date": args.date, "provider": "odds_api",
        "creditsRemaining": remaining,
        "disclaimer": "Sportsbook player-prop universe (the books' own listed players). A listed "
                      "player is a candidate, NOT a confirmed starter.",
        "matchCount": len(matches), "matches": matches,
    }
    (DATA / "player-markets").mkdir(parents=True, exist_ok=True)
    (DATA / "player-markets" / f"{args.date}.json").write_text(json.dumps(payload, indent=2) + "\n")
    (DATA / "player-markets" / "latest.json").write_text(json.dumps(payload, indent=2) + "\n")
    tot = sum(m["distinctPlayers"] for m in matches)
    print(f"[wc-player-universe] events={len(matches)} distinctPlayers={tot} creditsRem={remaining}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
